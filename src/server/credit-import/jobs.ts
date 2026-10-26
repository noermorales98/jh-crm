/**
 * Jobs de análisis PDF de crédito (after() + recuperación por cron).
 * Escrituras de fase/resultado van gated por leaseToken.
 */
import { randomUUID } from "node:crypto";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { creditClientForRole, creditProposalClientForRole } from "@/src/lib/credit/access";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import {
  getObjectBytes,
  isStorageConfigured,
} from "@/src/lib/storage/s3";
import {
  creditPdfExtractionProposalSchema,
  type CreditPdfExtractionProposal,
} from "@/src/lib/validation/credit-import";
import type { Prisma } from "@prisma/client";
import { createCreditCase } from "@/src/server/cases";
import {
  CREDIT_PDF_JOB_CRON_BATCH,
  CREDIT_PDF_JOB_CRON_DEADLINE_BUFFER_MS,
  CREDIT_PDF_JOB_LEASE_MS,
  CREDIT_PDF_JOB_MAX_ATTEMPTS,
  CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS,
  isLeaseExpired,
  isQueuedRecoverable,
  leaseExpiryFrom,
  shouldFailAfterAttempt,
  type CreditPdfClaimKind,
} from "./job-lease";
import { buildProposalFromDocumentBytes } from "./proposal-from-document";
import {
  checkpointToSeed,
  parseCreditPdfAiCheckpoint,
  upsertCheckpointWindow,
  type CreditPdfAiCheckpoint,
} from "./ai-checkpoint";
import {
  settleFailedCreditPdfImportNotify,
  settlePendingFailedCreditPdfImportNotifies,
  settleSucceededCreditPdfImportEffects,
  settlePendingSucceededCreditPdfImportEffects,
} from "./job-effects";
import { autoConfirmCreditPdfImportIfEligible } from "./auto-confirm";

export {
  settleFailedCreditPdfImportNotify,
  settlePendingFailedCreditPdfImportNotifies,
  settleSucceededCreditPdfImportEffects,
  settlePendingSucceededCreditPdfImportEffects,
  type CreditPdfCreateNotification,
} from "./job-effects";

const PHASES = {
  download: { progress: 10, label: "Descargando PDF" },
  extract: { progress: 35, label: "Extrayendo texto" },
  /** Arranque de IA; las ventanas suben de 40→90 sin bajar. */
  ai: { progress: 40, label: "Analizando con IA" },
  validate: { progress: 90, label: "Validando resultado" },
  done: { progress: 100, label: "Listo" },
} as const;

export type CreditPdfJobPhase = keyof typeof PHASES;

class LeaseLostError extends Error {
  constructor() {
    super("Lease perdido; otro worker posee el job.");
    this.name = "LeaseLostError";
  }
}

function progressPath(caseId: string, jobId: string) {
  return `/crm/casos/${caseId}/credito/importaciones/${jobId}`;
}

/** Log seguro: solo ids/status, nunca PDF ni PII. */
function logJob(event: string, data: Record<string, string | number | boolean | null>) {
  console.info(`[credit-pdf-job] ${event}`, data);
}

async function touchLease(
  jobId: string,
  leaseToken: string,
  data: Prisma.CreditPdfImportJobUpdateInput,
): Promise<void> {
  const now = new Date();
  const updated = await prisma.creditPdfImportJob.updateMany({
    where: { id: jobId, leaseToken, status: "RUNNING" },
    data: {
      ...data,
      leaseExpiresAt: leaseExpiryFrom(now),
      heartbeatAt: now,
    },
  });
  if (updated.count === 0) throw new LeaseLostError();
}

async function setPhase(
  jobId: string,
  leaseToken: string,
  phase: CreditPdfJobPhase,
  extra?: Prisma.CreditPdfImportJobUpdateInput,
) {
  await touchLease(jobId, leaseToken, {
    phase,
    progress: PHASES[phase].progress,
    ...extra,
  });
}

export type CreditCaseOpenOption = { id: string; label: string };

export type CreditCaseResolution =
  | { status: "resolved"; caseId: string; clientId: string; serviceCaseId: string }
  | { status: "needs_case" }
  | { status: "needs_case_choice"; cases: CreditCaseOpenOption[] };

export type EnqueuedCreditPdfJob = {
  jobId: string;
  caseId: string;
  progressPath: string;
  /** true si se creó ahora; false si ya existía un job abierto para el documento. */
  created: boolean;
  /** Solo tiene sentido llamar `after(process…)` si el job sigue QUEUED. */
  shouldProcess: boolean;
};

export type CreditPdfUploadAnalysisMeta =
  | {
      status: "queued" | "existing";
      jobId: string;
      caseId: string;
      progressPath: string;
      shouldProcess: boolean;
      message: string;
    }
  | {
      status: "skipped_permission";
      message: string;
    }
  | {
      status: "needs_case";
      message: string;
    }
  | {
      status: "needs_case_choice";
      openCases: CreditCaseOpenOption[];
      message: string;
    };

type DbClient = Prisma.TransactionClient | typeof prisma;

function openJobWhere(
  documentId: string,
  organizationId: string,
): Prisma.CreditPdfImportJobWhereInput {
  return {
    documentId,
    organizationId,
    OR: [
      { status: { in: ["QUEUED", "RUNNING"] } },
      { status: "SUCCEEDED", NOT: { phase: "confirmed" } },
    ],
  };
}

export async function findOpenJobForDocument(
  documentId: string,
  organizationId: string,
  db: DbClient = prisma,
) {
  return db.creditPdfImportJob.findFirst({
    where: openJobWhere(documentId, organizationId),
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Resuelve el CreditCase para análisis PDF.
 * caseId explícito gana; sin él: 0 OPEN → needs_case, 1 → resolved, N → needs_case_choice.
 */
export async function resolveCreditCaseForPdfAnalysis(
  ctx: OrganizationContext,
  input: { clientId: string; caseId?: string | null },
  db: DbClient = prisma,
): Promise<CreditCaseResolution> {
  if (input.caseId) {
    const creditCase = await db.creditCase.findFirst({
      where: {
        id: input.caseId,
        organizationId: ctx.organizationId,
        clientId: input.clientId,
      },
      select: { id: true, clientId: true, serviceCaseId: true },
    });
    if (!creditCase) {
      throw new DomainError("Caso no encontrado para este cliente.");
    }
    return {
      status: "resolved",
      caseId: creditCase.id,
      clientId: creditCase.clientId,
      serviceCaseId: creditCase.serviceCaseId,
    };
  }

  const openCases = await db.creditCase.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId: input.clientId,
      state: "OPEN",
    },
    orderBy: [{ openedAt: "desc" }, { id: "asc" }],
    select: { id: true, caseCode: true, serviceCaseId: true, clientId: true },
    take: 20,
  });

  if (openCases.length === 0) return { status: "needs_case" };
  if (openCases.length === 1) {
    const only = openCases[0]!;
    return {
      status: "resolved",
      caseId: only.id,
      clientId: only.clientId,
      serviceCaseId: only.serviceCaseId,
    };
  }

  return {
    status: "needs_case_choice",
    cases: openCases.map((c) => ({
      id: c.id,
      label: c.caseCode,
    })),
  };
}

/**
 * Encola (o reutiliza) un job por documentId. Idempotente.
 * Varios QUEUED del mismo usuario están permitidos (lease + cron).
 */
export async function enqueueCreditPdfImportJob(
  ctx: OrganizationContext,
  input: { caseId: string; documentId: string },
  db: DbClient = prisma,
): Promise<EnqueuedCreditPdfJob> {
  if (!isStorageConfigured()) {
    throw new DomainError("El almacenamiento S3 no está configurado.");
  }

  const creditCase = await db.creditCase.findFirst({
    where: { id: input.caseId, organizationId: ctx.organizationId },
    select: { id: true, clientId: true },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const document = await db.document.findFirst({
    where: {
      id: input.documentId,
      organizationId: ctx.organizationId,
      deletedAt: null,
      hardDeletedAt: null,
      OR: [
        { caseId: input.caseId },
        { clientId: creditCase.clientId, caseId: null },
      ],
    },
  });
  if (!document) throw new DomainError("Documento no encontrado en este caso.");
  if (document.mimeType !== "application/pdf") {
    throw new DomainError("Solo se pueden analizar PDFs.");
  }

  const existing = await findOpenJobForDocument(document.id, ctx.organizationId, db);
  if (existing) {
    return {
      jobId: existing.id,
      caseId: existing.caseId,
      progressPath: progressPath(existing.caseId, existing.id),
      created: false,
      shouldProcess: existing.status === "QUEUED",
    };
  }

  const fileName =
    document.displayName || document.originalName || "reporte.pdf";

  const job = await db.creditPdfImportJob.create({
    data: {
      organizationId: ctx.organizationId,
      caseId: creditCase.id,
      clientId: creditCase.clientId,
      documentId: document.id,
      createdById: ctx.userId,
      status: "QUEUED",
      phase: "download",
      progress: 0,
      fileName,
      attempts: 0,
    },
  });

  return {
    jobId: job.id,
    caseId: creditCase.id,
    progressPath: progressPath(creditCase.id, job.id),
    created: true,
    shouldProcess: true,
  };
}

/** Arranque manual / action: enqueue idempotente por documento. */
export async function startCreditPdfImportJob(
  ctx: OrganizationContext,
  input: { caseId: string; documentId: string },
) {
  const enqueued = await enqueueCreditPdfImportJob(ctx, input);
  return {
    jobId: enqueued.jobId,
    caseId: enqueued.caseId,
    progressPath: enqueued.progressPath,
    created: enqueued.created,
    shouldProcess: enqueued.shouldProcess,
  };
}

/**
 * Tras crear un Document CREDIT_REPORT/UPDATE_REPORT PDF:
 * encola análisis si hay permiso y caso resuelto.
 * Sin caso OPEN y con cases.manage: crea CREDIT_REPAIR OPEN y encola.
 * Debe llamarse post-commit del Document (createCreditCase usa su propia tx).
 */
export async function maybeEnqueueCreditPdfAnalysisAfterUpload(
  ctx: OrganizationContext,
  input: {
    documentId: string;
    clientId: string;
    caseId?: string | null;
    category: string;
    mimeType: string;
  },
  db: DbClient = prisma,
): Promise<CreditPdfUploadAnalysisMeta | undefined> {
  if (
    input.category !== "CREDIT_REPORT" &&
    input.category !== "UPDATE_REPORT"
  ) {
    return undefined;
  }
  if (input.mimeType !== "application/pdf") return undefined;

  if (!can(ctx.role, "creditReports.manage")) {
    return {
      status: "skipped_permission",
      message:
        "Documento guardado. No tienes permiso para iniciar el análisis automático; un colega con acceso a reportes puede analizarlo.",
    };
  }

  let resolution = await resolveCreditCaseForPdfAnalysis(
    ctx,
    { clientId: input.clientId, caseId: input.caseId },
    db,
  );

  let caseAutoCreated = false;

  if (resolution.status === "needs_case") {
    if (!can(ctx.role, "cases.manage")) {
      return {
        status: "needs_case",
        message:
          "Documento guardado. Crea un caso de crédito OPEN para este cliente antes de analizar el PDF.",
      };
    }

    // createCreditCase abre su propia transacción; no anidar dentro de un tx de Document.
    const creditCase = await createCreditCase(ctx, {
      clientId: input.clientId,
      assignedToId: ctx.userId,
      summary: "Creado al subir reporte de crédito",
    });
    resolution = {
      status: "resolved",
      caseId: creditCase.id,
      clientId: creditCase.clientId,
      serviceCaseId: creditCase.serviceCaseId,
    };
    caseAutoCreated = true;
  }

  if (resolution.status === "needs_case_choice") {
    return {
      status: "needs_case_choice",
      openCases: resolution.cases,
      message:
        "Documento guardado. Hay varios casos OPEN: elige uno para analizar el PDF (no se elige automáticamente).",
    };
  }

  // Asociar el documento al caso resuelto si subió sin caseId.
  const doc = await db.document.findFirst({
    where: { id: input.documentId, organizationId: ctx.organizationId },
    select: { id: true, caseId: true },
  });
  if (doc && !doc.caseId) {
    await db.document.update({
      where: { id: doc.id },
      data: {
        caseId: resolution.caseId,
        serviceCaseId: resolution.serviceCaseId,
      },
    });
  }

  const enqueued = await enqueueCreditPdfImportJob(
    ctx,
    { caseId: resolution.caseId, documentId: input.documentId },
    db,
  );

  if (enqueued.created) {
    return {
      status: "queued",
      jobId: enqueued.jobId,
      caseId: enqueued.caseId,
      progressPath: enqueued.progressPath,
      shouldProcess: enqueued.shouldProcess,
      message: caseAutoCreated
        ? "Caso de crédito creado. Documento guardado y análisis encolado. Puedes cerrar la app y volver a la página de progreso cuando quieras."
        : "Documento guardado y análisis encolado. Puedes cerrar la app y volver a la página de progreso cuando quieras.",
    };
  }

  return {
    status: "existing",
    jobId: enqueued.jobId,
    caseId: enqueued.caseId,
    progressPath: enqueued.progressPath,
    shouldProcess: enqueued.shouldProcess,
    message:
      "Ya hay un análisis abierto para este documento. Abre el progreso para revisarlo.",
  };
}

export type ClaimedCreditPdfJob = {
  jobId: string;
  leaseToken: string;
  kind: CreditPdfClaimKind;
  attempts: number;
};

/**
 * Reclamo atómico de un job concreto (QUEUED o RUNNING con lease vencido).
 * Dos callers concurrentes: solo uno obtiene count=1.
 */
export async function claimCreditPdfImportJob(
  jobId: string,
  now = new Date(),
): Promise<ClaimedCreditPdfJob | null> {
  const job = await prisma.creditPdfImportJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      attempts: true,
      leaseExpiresAt: true,
      createdAt: true,
    },
  });
  if (!job) return null;
  if (job.status === "SUCCEEDED" || job.status === "FAILED") return null;
  if (job.attempts >= CREDIT_PDF_JOB_MAX_ATTEMPTS) return null;

  const leaseToken = randomUUID();
  const leaseExpiresAt = leaseExpiryFrom(now);

  if (job.status === "QUEUED") {
    const claimed = await prisma.creditPdfImportJob.updateMany({
      where: {
        id: jobId,
        status: "QUEUED",
        attempts: { lt: CREDIT_PDF_JOB_MAX_ATTEMPTS },
      },
      data: {
        status: "RUNNING",
        phase: "download",
        progress: 10,
        startedAt: now,
        finishedAt: null,
        leaseToken,
        leaseExpiresAt,
        heartbeatAt: now,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 0) return null;
    return {
      jobId,
      leaseToken,
      kind: "queued",
      attempts: job.attempts + 1,
    };
  }

  if (job.status === "RUNNING" && isLeaseExpired(job.leaseExpiresAt, now)) {
    const claimed = await prisma.creditPdfImportJob.updateMany({
      where: {
        id: jobId,
        status: "RUNNING",
        attempts: { lt: CREDIT_PDF_JOB_MAX_ATTEMPTS },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: {
        phase: "download",
        progress: 10,
        startedAt: now,
        finishedAt: null,
        leaseToken,
        leaseExpiresAt,
        heartbeatAt: now,
        attempts: { increment: 1 },
        errorMessage: null,
      },
    });
    if (claimed.count === 0) return null;
    return {
      jobId,
      leaseToken,
      kind: "stale_running",
      attempts: job.attempts + 1,
    };
  }

  return null;
}

/**
 * Lista candidatos a recovery (sin reclamar). Orden: más antiguos primero.
 */
export async function listRecoverableCreditPdfImportJobs(
  limit: number,
  now = new Date(),
): Promise<Array<{ id: string; status: "QUEUED" | "RUNNING" }>> {
  const queuedBefore = new Date(now.getTime() - CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS);
  const rows = await prisma.creditPdfImportJob.findMany({
    where: {
      attempts: { lt: CREDIT_PDF_JOB_MAX_ATTEMPTS },
      OR: [
        {
          status: "QUEUED",
          createdAt: { lte: queuedBefore },
        },
        {
          status: "RUNNING",
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.max(1, limit),
    select: { id: true, status: true },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status as "QUEUED" | "RUNNING",
  }));
}

async function failOrRequeue(
  jobId: string,
  leaseToken: string,
  attempts: number,
  message: string,
): Promise<"failed" | "requeued" | "lease_lost"> {
  if (shouldFailAfterAttempt(attempts)) {
    const updated = await prisma.creditPdfImportJob.updateMany({
      where: { id: jobId, leaseToken, status: "RUNNING" },
      data: {
        status: "FAILED",
        phase: "done",
        progress: 100,
        finishedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        errorMessage: message.slice(0, 2000),
      },
    });
    if (updated.count === 0) return "lease_lost";

    // Aviso recuperable por cron si falla (sin re-analizar).
    await settleFailedCreditPdfImportNotify(jobId);
    logJob("failed_final", { jobId, attempts });
    return "failed";
  }

  const updated = await prisma.creditPdfImportJob.updateMany({
    where: { id: jobId, leaseToken, status: "RUNNING" },
    data: {
      status: "QUEUED",
      phase: "download",
      progress: 0,
      finishedAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      errorMessage: message.slice(0, 2000),
    },
  });
  if (updated.count === 0) return "lease_lost";
  logJob("requeued", { jobId, attempts });
  return "requeued";
}

const EXHAUSTED_INTERRUPT_MESSAGE =
  "El análisis se interrumpió tras agotar los reintentos.";

/**
 * QUEUED/RUNNING con attempts >= max y lease vencido (si RUNNING).
 * Transición atómica a FAILED; el aviso de fallo se asienta aparte (reintentable).
 */
export async function finalizeExhaustedCreditPdfImportJob(
  jobId: string,
  now = new Date(),
): Promise<boolean> {
  const job = await prisma.creditPdfImportJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      attempts: true,
      leaseExpiresAt: true,
      errorMessage: true,
    },
  });
  if (!job) return false;
  if (job.attempts < CREDIT_PDF_JOB_MAX_ATTEMPTS) return false;
  if (job.status !== "QUEUED" && job.status !== "RUNNING") return false;
  if (job.status === "RUNNING" && !isLeaseExpired(job.leaseExpiresAt, now)) {
    return false;
  }

  const message =
    (job.errorMessage && job.errorMessage.trim()) || EXHAUSTED_INTERRUPT_MESSAGE;

  const updated = await prisma.creditPdfImportJob.updateMany({
    where: {
      id: jobId,
      attempts: { gte: CREDIT_PDF_JOB_MAX_ATTEMPTS },
      OR: [
        { status: "QUEUED" },
        {
          status: "RUNNING",
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
      ],
    },
    data: {
      status: "FAILED",
      phase: "done",
      progress: 100,
      finishedAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      errorMessage: message.slice(0, 2000),
    },
  });
  if (updated.count === 0) return false;

  await settleFailedCreditPdfImportNotify(jobId);
  logJob("exhausted_finalized", { jobId, attempts: job.attempts });
  return true;
}

export async function finalizeExhaustedCreditPdfImportJobs(
  limit: number,
  now = new Date(),
): Promise<number> {
  const candidates = await prisma.creditPdfImportJob.findMany({
    where: {
      attempts: { gte: CREDIT_PDF_JOB_MAX_ATTEMPTS },
      OR: [
        { status: "QUEUED" },
        {
          status: "RUNNING",
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
      ],
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: Math.max(1, limit),
    select: { id: true },
  });

  let finalized = 0;
  for (const row of candidates) {
    if (await finalizeExhaustedCreditPdfImportJob(row.id, now)) {
      finalized += 1;
    }
  }
  return finalized;
}

/**
 * Notificación de fallo para jobs ya FAILED. Idempotente (dedupeKey).
 * Si createNotification falla, queda pendiente para el cron (sin re-PDF).
 */
/**
 * Ejecuta el pipeline con lease. Si el lease se pierde, aborta sin FAILED.
 */
export type RunClaimedCreditPdfOutcome =
  | "succeeded"
  | "effects_pending"
  | "failed"
  | "requeued"
  | "lease_lost";

/**
 * Ejecuta el pipeline con lease. Si el lease se pierde, aborta sin FAILED.
 * Tras SUCCEEDED, asienta efectos fuera del pipeline (recuperables sin re-PDF).
 */
export async function runClaimedCreditPdfImportJob(
  jobId: string,
  leaseToken: string,
  attempts: number,
): Promise<RunClaimedCreditPdfOutcome> {
  const job = await prisma.creditPdfImportJob.findFirst({
    where: { id: jobId, leaseToken, status: "RUNNING" },
  });
  if (!job) return "lease_lost";

  try {
    await setPhase(jobId, leaseToken, "download");
    const document = await prisma.document.findFirst({
      where: { id: job.documentId, organizationId: job.organizationId },
    });
    if (!document) throw new DomainError("Documento no encontrado.");

    const pdfBytes = await getObjectBytes(document.storageKey);
    const fileName = job.fileName || document.displayName || document.originalName;

    await setPhase(jobId, leaseToken, "extract");
    await setPhase(jobId, leaseToken, "ai");

    // Reanudar ventanas tras timeout Hobby (proposalJson = checkpoint parcial).
    let aiCheckpoint: CreditPdfAiCheckpoint | null = parseCreditPdfAiCheckpoint(
      job.proposalJson,
    );
    const windowSeed = checkpointToSeed(aiCheckpoint);
    let checkpointWrite: Promise<void> = Promise.resolve();
    // Progreso monótono con concurrencia 2 (índices fuera de orden no bajan la barra).
    let maxAiProgress =
      windowSeed.size > 0
        ? Math.min(88, 40 + Math.round((windowSeed.size / 5) * 48))
        : 40;
    if (windowSeed.size > 0) {
      logJob("ai_checkpoint_resume", {
        jobId,
        seededWindows: windowSeed.size,
      });
    }

    const built = await buildProposalFromDocumentBytes({
      pdfBytes,
      fileName: fileName || "reporte.pdf",
      windowSeed: windowSeed.size > 0 ? windowSeed : undefined,
      concurrency: 2,
      // Renovar lease ANTES de cada llamada OpenRouter (puede durar minutos).
      onWindowStart: async ({ windowIndex, windowTotal }) => {
        const raw = Math.min(
          88,
          40 + Math.round((windowIndex / Math.max(windowTotal, 1)) * 48),
        );
        maxAiProgress = Math.max(maxAiProgress, raw);
        await touchLease(jobId, leaseToken, {
          phase: "ai",
          progress: maxAiProgress,
        });
        logJob("ai_window_start", {
          jobId,
          windowIndex,
          windowTotal,
        });
      },
      onWindowComplete: async ({ windowIndex, windowTotal, proposal }) => {
        // Serializar writes: concurrencia 2 no debe pisar el checkpoint.
        checkpointWrite = checkpointWrite.then(async () => {
          aiCheckpoint = upsertCheckpointWindow(aiCheckpoint, {
            windowTotal,
            windowIndex,
            proposal,
          });
          const raw = Math.min(
            90,
            40 +
              Math.round(
                (aiCheckpoint!.windows.length / Math.max(windowTotal, 1)) * 50,
              ),
          );
          maxAiProgress = Math.max(maxAiProgress, raw);
          await touchLease(jobId, leaseToken, {
            phase: "ai",
            progress: maxAiProgress,
            proposalJson: aiCheckpoint as unknown as Prisma.InputJsonValue,
          });
          logJob("ai_window", {
            jobId,
            windowIndex,
            windowTotal,
            checkpointWindows: aiCheckpoint!.windows.length,
          });
        });
        await checkpointWrite;
      },
    });

    await setPhase(jobId, leaseToken, "validate");
    const validated = built.proposal;
    const { extract, suggestedReportType } = built;

    const creditCase = await prisma.creditCase.findFirst({
      where: { id: job.caseId, organizationId: job.organizationId },
      select: {
        client: {
          select: {
            firstName: true,
            lastName: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
          },
        },
      },
    });
    const sensitive = await prisma.clientSensitiveProfile.findUnique({
      where: { clientId: job.clientId },
      select: { ssnLast4: true, dateOfBirthEncrypted: true },
    });

    const currentClient = {
      firstName: creditCase?.client.firstName ?? "",
      lastName: creditCase?.client.lastName ?? null,
      addressLine1: creditCase?.client.addressLine1 ?? null,
      addressLine2: creditCase?.client.addressLine2 ?? null,
      city: creditCase?.client.city ?? null,
      state: creditCase?.client.state ?? null,
      postalCode: creditCase?.client.postalCode ?? null,
      country: creditCase?.client.country ?? null,
      ssnLast4: sensitive?.ssnLast4 ?? null,
      hasDateOfBirth: Boolean(sensitive?.dateOfBirthEncrypted),
    };

    const done = await prisma.creditPdfImportJob.updateMany({
      where: { id: jobId, leaseToken, status: "RUNNING" },
      data: {
        status: "SUCCEEDED",
        phase: "done",
        progress: 100,
        finishedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        effectsSettledAt: null,
        proposalJson: validated as unknown as Prisma.InputJsonValue,
        extractMode: extract.mode,
        pageCount: extract.pageCount,
        suggestedReportType,
        currentClientJson: currentClient as unknown as Prisma.InputJsonValue,
        errorMessage: null,
        fileName: fileName || job.fileName,
      },
    });
    if (done.count === 0) return "lease_lost";
  } catch (error) {
    if (error instanceof LeaseLostError) {
      logJob("lease_lost", { jobId });
      return "lease_lost";
    }
    // Solo DomainError es mensaje seguro para usuario/DB; no filtrar excepciones crudas
    // (pueden incluir extractos del reporte) hacia logs, errorMessage ni notificaciones.
    const message =
      error instanceof DomainError
        ? error.message
        : "Error al analizar el PDF.";
    return failOrRequeue(jobId, leaseToken, attempts, message);
  }

  // Publicar al expediente cuando la propuesta es elegible (sin UI de confirmar).
  const auto = await autoConfirmCreditPdfImportIfEligible(jobId);
  logJob("auto_confirm", {
    jobId,
    applied: auto.applied,
    reason: auto.applied ? null : auto.reason,
  });

  // Análisis ya persistido como SUCCEEDED: no reintentar PDF si fallan efectos.
  const settled = await settleSucceededCreditPdfImportEffects(jobId);
  if (settled === "pending") {
    logJob("succeeded_effects_pending", { jobId, attempts });
    return "effects_pending";
  }
  logJob("succeeded", { jobId, attempts });
  return "succeeded";
}

/** Arranque desde after() o invoker único: claim + run. */
export async function processCreditPdfImportJob(jobId: string): Promise<void> {
  const claimed = await claimCreditPdfImportJob(jobId);
  if (!claimed) {
    const finalized = await finalizeExhaustedCreditPdfImportJob(jobId);
    await settleFailedCreditPdfImportNotify(jobId);
    await settleSucceededCreditPdfImportEffects(jobId);
    logJob("claim_skip", { jobId, finalized });
    return;
  }
  logJob("claimed", {
    jobId,
    kind: claimed.kind,
    attempts: claimed.attempts,
  });
  await runClaimedCreditPdfImportJob(
    claimed.jobId,
    claimed.leaseToken,
    claimed.attempts,
  );
}

export type RecoverCreditPdfJobsResult = {
  scanned: number;
  claimed: number;
  succeeded: number;
  failed: number;
  requeued: number;
  leaseLost: number;
  effectsPending: number;
  finalizedExhausted: number;
  effectsSettled: number;
  failNotifiesSettled: number;
  skippedDeadline: number;
};

/**
 * Recovery batch para el cron:
 * 1) finaliza QUEUED/RUNNING agotados (lease vencido) → FAILED
 * 2) reintenta avisos de fallo pendientes (sin re-PDF)
 * 3) asienta efectos pendientes de SUCCEEDED (sin re-PDF)
 * 4) reclama y procesa recuperables hasta `limit` o `deadline`
 */
export async function recoverCreditPdfImportJobs(options?: {
  limit?: number;
  deadline?: Date;
  now?: Date;
}): Promise<RecoverCreditPdfJobsResult> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? CREDIT_PDF_JOB_CRON_BATCH;
  const deadline =
    options?.deadline ??
    new Date(
      now.getTime() +
        120_000 -
        CREDIT_PDF_JOB_CRON_DEADLINE_BUFFER_MS,
    );

  const result: RecoverCreditPdfJobsResult = {
    scanned: 0,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    requeued: 0,
    leaseLost: 0,
    effectsPending: 0,
    finalizedExhausted: 0,
    effectsSettled: 0,
    failNotifiesSettled: 0,
    skippedDeadline: 0,
  };

  result.finalizedExhausted = await finalizeExhaustedCreditPdfImportJobs(
    limit,
    now,
  );
  result.failNotifiesSettled =
    await settlePendingFailedCreditPdfImportNotifies(limit);
  result.effectsSettled = await settlePendingSucceededCreditPdfImportEffects(
    limit,
  );

  const candidates = await listRecoverableCreditPdfImportJobs(limit * 2, now);
  result.scanned = candidates.length;

  for (const candidate of candidates) {
    if (Date.now() >= deadline.getTime()) {
      result.skippedDeadline += 1;
      break;
    }
    if (result.claimed >= limit) break;

    const claimed = await claimCreditPdfImportJob(candidate.id);
    if (!claimed) {
      // Posible carrera: otro worker agotó intentos entre list y claim.
      if (await finalizeExhaustedCreditPdfImportJob(candidate.id, now)) {
        result.finalizedExhausted += 1;
      }
      continue;
    }
    result.claimed += 1;
    logJob("cron_claimed", {
      jobId: claimed.jobId,
      kind: claimed.kind,
      attempts: claimed.attempts,
    });

    const outcome = await runClaimedCreditPdfImportJob(
      claimed.jobId,
      claimed.leaseToken,
      claimed.attempts,
    );
    if (outcome === "succeeded") result.succeeded += 1;
    else if (outcome === "effects_pending") result.effectsPending += 1;
    else if (outcome === "failed") result.failed += 1;
    else if (outcome === "requeued") result.requeued += 1;
    else result.leaseLost += 1;
  }

  return result;
}

export async function getCreditPdfImportJob(
  ctx: OrganizationContext,
  jobId: string,
) {
  const job = await prisma.creditPdfImportJob.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
  });
  if (!job) throw new DomainError("Importación no encontrada.");
  if (job.createdById !== ctx.userId && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    throw new DomainError("No tienes acceso a este análisis.");
  }

  let proposal: CreditPdfExtractionProposal | null = null;
  if (job.proposalJson) {
    const parsed = creditPdfExtractionProposalSchema.safeParse(job.proposalJson);
    proposal = parsed.success ? parsed.data : null;
  }

  const reportId =
    job.phase === "confirmed" && proposal?.review?.reportId
      ? proposal.review.reportId
      : null;

  return {
    id: job.id,
    caseId: job.caseId,
    clientId: job.clientId,
    documentId: job.documentId,
    status: job.status,
    phase: job.phase,
    phaseLabel: job.phase && job.phase in PHASES
      ? PHASES[job.phase as CreditPdfJobPhase].label
      : job.phase === "confirmed"
        ? "Confirmado"
        : null,
    progress: job.progress,
    fileName: job.fileName,
    errorMessage: job.errorMessage,
    extractMode: job.extractMode,
    pageCount: job.pageCount,
    suggestedReportType: job.suggestedReportType as
      | "INITIAL"
      | "UPDATE"
      | "MANUAL"
      | null,
    proposal: proposal
      ? {
          ...proposal,
          client: creditProposalClientForRole(ctx.role, proposal.client) ?? null,
        }
      : null,
    currentClient: creditClientForRole(
      ctx.role,
      job.currentClientJson as AnalyzeCurrentClient | null,
    ),
    attempts: job.attempts,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
    progressPath: progressPath(job.caseId, job.id),
    reportId,
    reportPath: reportId
      ? `/crm/casos/${job.caseId}/credito/reportes/${reportId}`
      : null,
  };
}

export type AnalyzeCurrentClient = {
  firstName: string;
  lastName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  ssnLast4: string | null;
  hasDateOfBirth: boolean;
};

export async function listActiveCreditPdfImportJobs(
  ctx: OrganizationContext,
) {
  return prisma.creditPdfImportJob.findMany({
    where: {
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      OR: [
        { status: { in: ["QUEUED", "RUNNING"] } },
        {
          status: "SUCCEEDED",
          NOT: { phase: "confirmed" },
          finishedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        {
          status: "FAILED",
          finishedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      caseId: true,
      status: true,
      phase: true,
      progress: true,
      fileName: true,
      errorMessage: true,
      finishedAt: true,
    },
  });
}

/** SUCCEEDED sin confirmar — pendientes de aplicar al expediente. */
export type PendingConfirmCreditPdfJob = {
  id: string;
  caseId: string;
  fileName: string | null;
  finishedAt: Date | null;
  documentKind: string | null;
  snapshotCount: number;
  itemCount: number;
  progressPath: string;
};

export async function listPendingConfirmCreditPdfJobs(
  ctx: OrganizationContext,
  filter: { caseId?: string; clientId?: string } = {},
): Promise<PendingConfirmCreditPdfJob[]> {
  const rows = await prisma.creditPdfImportJob.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: "SUCCEEDED",
      NOT: { phase: "confirmed" },
      ...(filter.caseId ? { caseId: filter.caseId } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
    },
    orderBy: { finishedAt: "desc" },
    take: 8,
    select: {
      id: true,
      caseId: true,
      fileName: true,
      finishedAt: true,
      proposalJson: true,
    },
  });

  return rows.map((row) => {
    const proposal = row.proposalJson as {
      documentKind?: string;
      report?: { snapshots?: unknown[]; items?: unknown[] };
    } | null;
    return {
      id: row.id,
      caseId: row.caseId,
      fileName: row.fileName,
      finishedAt: row.finishedAt,
      documentKind: proposal?.documentKind ?? null,
      snapshotCount: proposal?.report?.snapshots?.length ?? 0,
      itemCount: proposal?.report?.items?.length ?? 0,
      progressPath: progressPath(row.caseId, row.id),
    };
  });
}

export {
  PHASES,
  CREDIT_PDF_JOB_LEASE_MS,
  CREDIT_PDF_JOB_MAX_ATTEMPTS,
  CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS,
  CREDIT_PDF_JOB_CRON_BATCH,
  CREDIT_PDF_JOB_CRON_DEADLINE_BUFFER_MS,
  isQueuedRecoverable,
  isLeaseExpired,
  shouldFailAfterAttempt,
};
