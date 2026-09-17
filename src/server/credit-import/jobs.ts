/**
 * Jobs de análisis PDF de crédito (segundo plano vía next/after).
 */
import type { OrganizationContext } from "@/src/server/auth/guards";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import {
  getObjectBytes,
  isStorageConfigured,
} from "@/src/lib/storage/s3";
import { writeAuditLog } from "@/src/server/audit";
import { createNotification } from "@/src/server/notifications";
import {
  creditPdfExtractionProposalSchema,
  type CreditPdfExtractionProposal,
} from "@/src/lib/validation/credit-import";
import { extractPdfContent } from "./pdf-text";
import { classifyAndExtractFromPdf } from "./extract";
import type { Prisma } from "@prisma/client";

const PHASES = {
  download: { progress: 10, label: "Descargando PDF" },
  extract: { progress: 35, label: "Extrayendo texto" },
  ai: { progress: 75, label: "Analizando con IA" },
  validate: { progress: 90, label: "Validando resultado" },
  done: { progress: 100, label: "Listo" },
} as const;

export type CreditPdfJobPhase = keyof typeof PHASES;

function progressPath(caseId: string, jobId: string) {
  return `/crm/casos/${caseId}/credito/importaciones/${jobId}`;
}

async function setPhase(
  jobId: string,
  phase: CreditPdfJobPhase,
  extra?: Prisma.CreditPdfImportJobUpdateInput,
) {
  await prisma.creditPdfImportJob.update({
    where: { id: jobId },
    data: {
      phase,
      progress: PHASES[phase].progress,
      ...extra,
    },
  });
}

export async function startCreditPdfImportJob(
  ctx: OrganizationContext,
  input: { caseId: string; documentId: string },
) {
  if (!isStorageConfigured()) {
    throw new DomainError("El almacenamiento S3 no está configurado.");
  }

  const creditCase = await prisma.creditCase.findFirst({
    where: { id: input.caseId, organizationId: ctx.organizationId },
    select: { id: true, clientId: true },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const document = await prisma.document.findFirst({
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

  const active = await prisma.creditPdfImportJob.findFirst({
    where: {
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
    select: { id: true, caseId: true },
  });
  if (active) {
    throw new DomainError(
      `Ya tienes un análisis en curso. Ábrelo en ${progressPath(active.caseId, active.id)} y espera a que termine.`,
    );
  }

  const fileName =
    document.displayName || document.originalName || "reporte.pdf";

  const job = await prisma.creditPdfImportJob.create({
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
    },
  });

  return {
    jobId: job.id,
    caseId: creditCase.id,
    progressPath: progressPath(creditCase.id, job.id),
  };
}

export async function processCreditPdfImportJob(jobId: string): Promise<void> {
  const job = await prisma.creditPdfImportJob.findUnique({
    where: { id: jobId },
  });
  if (!job) return;
  if (job.status === "SUCCEEDED" || job.status === "FAILED") return;
  if (job.status === "RUNNING") return;

  const claimed = await prisma.creditPdfImportJob.updateMany({
    where: { id: jobId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date(), phase: "download", progress: 10 },
  });
  if (claimed.count === 0) return;

  try {
    await setPhase(jobId, "download");
    const document = await prisma.document.findFirst({
      where: { id: job.documentId, organizationId: job.organizationId },
    });
    if (!document) throw new DomainError("Documento no encontrado.");

    const pdfBytes = await getObjectBytes(document.storageKey);
    if (pdfBytes.byteLength > 12 * 1024 * 1024) {
      throw new DomainError("El PDF supera 12 MB; divide o comprime el archivo.");
    }

    await setPhase(jobId, "extract");
    const extract = await extractPdfContent(pdfBytes);
    const fileName = job.fileName || document.displayName || document.originalName;

    await setPhase(jobId, "ai");
    const proposal = await classifyAndExtractFromPdf({
      extract,
      pdfBytes,
      fileName,
    });

    await setPhase(jobId, "validate");
    const validated = creditPdfExtractionProposalSchema.parse(proposal);

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

    const suggestedReportType =
      validated.documentKind === "CLIENT_PROGRESS_REPORT"
        ? "UPDATE"
        : validated.report?.typeHint === "INITIAL" ||
            validated.report?.typeHint === "UPDATE" ||
            validated.report?.typeHint === "MANUAL"
          ? validated.report.typeHint
          : "UPDATE";

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

    await prisma.creditPdfImportJob.update({
      where: { id: jobId },
      data: {
        status: "SUCCEEDED",
        phase: "done",
        progress: 100,
        finishedAt: new Date(),
        proposalJson: validated as unknown as Prisma.InputJsonValue,
        extractMode: extract.mode,
        pageCount: extract.pageCount,
        suggestedReportType,
        currentClientJson: currentClient as unknown as Prisma.InputJsonValue,
        errorMessage: null,
      },
    });

    await writeAuditLog(
      { organizationId: job.organizationId, actorUserId: job.createdById },
      {
        action: "CREDIT_PDF_ANALYZED",
        entityType: "CreditPdfImportJob",
        entityId: jobId,
        metadata: {
          caseId: job.caseId,
          documentKind: validated.documentKind,
          confidence: validated.confidence,
          extractMode: extract.mode,
          pageCount: extract.pageCount,
        },
      },
    );

    await createNotification({
      organizationId: job.organizationId,
      userId: job.createdById,
      type: "CREDIT_PDF_IMPORT",
      title: "Análisis de PDF listo",
      body: `${fileName}: revisa y confirma la importación.`,
      link: progressPath(job.caseId, jobId),
      dedupeKey: `credit-pdf-import:${jobId}:done`,
      skipWhatsapp: true,
      skipEmail: true,
    });
  } catch (error) {
    const message =
      error instanceof DomainError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Error al analizar el PDF.";
    await prisma.creditPdfImportJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        phase: "done",
        progress: 100,
        finishedAt: new Date(),
        errorMessage: message.slice(0, 2000),
      },
    });
    await createNotification({
      organizationId: job.organizationId,
      userId: job.createdById,
      type: "CREDIT_PDF_IMPORT",
      title: "Falló el análisis de PDF",
      body: message.slice(0, 280),
      link: progressPath(job.caseId, jobId),
      dedupeKey: `credit-pdf-import:${jobId}:fail`,
      skipWhatsapp: true,
      skipEmail: true,
    }).catch(() => undefined);
  }
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

  return {
    id: job.id,
    caseId: job.caseId,
    clientId: job.clientId,
    documentId: job.documentId,
    status: job.status,
    phase: job.phase,
    phaseLabel: job.phase && job.phase in PHASES
      ? PHASES[job.phase as CreditPdfJobPhase].label
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
    proposal,
    currentClient: job.currentClientJson as AnalyzeCurrentClient | null,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
    progressPath: progressPath(job.caseId, job.id),
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

export { PHASES };
