/**
 * Efectos post-SUCCEEDED/FAILED de CreditPdfImportJob (notificaciones + audit).
 * Recuperables sin re-analizar el PDF.
 */
import { prisma } from "@/src/lib/db";
import { writeAuditLog } from "@/src/server/audit";
import { createNotification } from "@/src/server/notifications";
import { creditPdfExtractionProposalSchema } from "@/src/lib/validation/credit-import";
import { autoConfirmCreditPdfImportIfEligible } from "./auto-confirm";
import { caseHref, creditAnalysisHref } from "@/src/lib/routes/case-routes";

function progressPath(clientId: string, caseId: string, jobId: string) {
  return caseHref(clientId, caseId, `/credito/importaciones/${jobId}`);
}

function logJob(event: string, data: Record<string, string | number | boolean | null>) {
  console.info("[credit-pdf-job]", event, data);
}

function failNotifyDedupeKey(jobId: string) {
  return `credit-pdf-import:${jobId}:fail`;
}

function doneNotifyDedupeKey(jobId: string) {
  return `credit-pdf-import:${jobId}:done`;
}

/** Inyectable en smokes para simular fallo de notificación. */
export type CreditPdfCreateNotification = typeof createNotification;

const EXHAUSTED_INTERRUPT_MESSAGE =
  "El análisis se interrumpió tras agotar los reintentos.";

export async function settleFailedCreditPdfImportNotify(
  jobId: string,
  options?: { createNotification?: CreditPdfCreateNotification },
): Promise<"settled" | "skipped" | "pending"> {
  const notify = options?.createNotification ?? createNotification;
  const job = await prisma.creditPdfImportJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      organizationId: true,
      createdById: true,
      caseId: true,
      clientId: true,
      errorMessage: true,
    },
  });
  if (!job || job.status !== "FAILED") return "skipped";

  const dedupeKey = failNotifyDedupeKey(jobId);
  const existing = await prisma.notification.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });
  if (existing) return "settled";

  const body =
    (job.errorMessage && job.errorMessage.trim().slice(0, 280)) ||
    EXHAUSTED_INTERRUPT_MESSAGE;

  try {
    await notify({
      organizationId: job.organizationId,
      userId: job.createdById,
      type: "CREDIT_PDF_IMPORT",
      title: "Falló el análisis de PDF",
      body,
      link: progressPath(job.clientId, job.caseId, job.id),
      dedupeKey,
      skipWhatsapp: true,
      skipEmail: true,
    });
    logJob("fail_notify_settled", { jobId });
    return "settled";
  } catch {
    logJob("fail_notify_pending", { jobId });
    return "pending";
  }
}

export async function settlePendingFailedCreditPdfImportNotifies(
  limit: number,
): Promise<number> {
  const candidates = await prisma.creditPdfImportJob.findMany({
    where: { status: "FAILED" },
    orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
    take: Math.max(1, limit * 4),
    select: { id: true },
  });

  let settled = 0;
  let checked = 0;
  for (const row of candidates) {
    if (settled >= limit) break;
    checked += 1;
    const dedupeKey = failNotifyDedupeKey(row.id);
    const existing = await prisma.notification.findUnique({
      where: { dedupeKey },
      select: { id: true },
    });
    if (existing) continue;
    const outcome = await settleFailedCreditPdfImportNotify(row.id);
    if (outcome === "settled") settled += 1;
    // Evitar escanear demasiados FAILED antiguos ya notificados.
    if (checked >= limit * 4) break;
  }
  return settled;
}

function reportPath(reportId: string) {
  return creditAnalysisHref(reportId);
}

/**
 * Efectos post-SUCCEEDED (auditoría + notificación).
 * Idempotente bajo concurrencia vía FOR UPDATE en la fila del job.
 * Si phase === "confirmed": avisa «Reporte aplicado»; si no, «revisa y confirma».
 */
export async function settleSucceededCreditPdfImportEffects(
  jobId: string,
): Promise<"settled" | "skipped" | "pending"> {
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT \`id\` FROM \`CreditPdfImportJob\`
        WHERE \`id\` = ${jobId}
        FOR UPDATE
      `;

      const job = await tx.creditPdfImportJob.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          status: true,
          phase: true,
          effectsSettledAt: true,
          organizationId: true,
          createdById: true,
          caseId: true,
          clientId: true,
          fileName: true,
          proposalJson: true,
          extractMode: true,
          pageCount: true,
        },
      });
      if (!job || job.status !== "SUCCEEDED") return "skipped" as const;
      if (job.effectsSettledAt) return "settled" as const;

      const alreadyConfirmed = job.phase === "confirmed";
      const parsed = creditPdfExtractionProposalSchema.safeParse(
        job.proposalJson,
      );
      const reportId =
        alreadyConfirmed && parsed.success
          ? parsed.data.review?.reportId ?? null
          : null;

      const existingAudit = await tx.auditLog.findFirst({
        where: {
          organizationId: job.organizationId,
          action: "CREDIT_PDF_ANALYZED",
          entityType: "CreditPdfImportJob",
          entityId: job.id,
        },
        select: { id: true },
      });
      if (!existingAudit) {
        await writeAuditLog(
          {
            organizationId: job.organizationId,
            actorUserId: job.createdById,
          },
          {
            action: "CREDIT_PDF_ANALYZED",
            entityType: "CreditPdfImportJob",
            entityId: job.id,
            metadata: {
              caseId: job.caseId,
              documentKind: parsed.success ? parsed.data.documentKind : null,
              confidence: parsed.success ? parsed.data.confidence : null,
              extractMode: job.extractMode,
              pageCount: job.pageCount,
            },
          },
          tx,
        );
      }

      if (alreadyConfirmed) {
        await createNotification(
          {
            organizationId: job.organizationId,
            userId: job.createdById,
            type: "CREDIT_PDF_IMPORT",
            title: "Reporte de crédito aplicado",
            body: `${job.fileName || "reporte.pdf"}: ya está en el expediente.`,
            link: reportId
              ? reportPath(reportId)
              : progressPath(job.clientId, job.caseId, job.id),
            dedupeKey: doneNotifyDedupeKey(job.id),
            skipWhatsapp: true,
            skipEmail: true,
          },
          tx,
        );
      } else {
        await createNotification(
          {
            organizationId: job.organizationId,
            userId: job.createdById,
            type: "CREDIT_PDF_IMPORT",
            title: "Análisis de PDF listo",
            body: `${job.fileName || "reporte.pdf"}: revisa y confirma la importación.`,
            link: progressPath(job.clientId, job.caseId, job.id),
            dedupeKey: doneNotifyDedupeKey(job.id),
            skipWhatsapp: true,
            skipEmail: true,
          },
          tx,
        );
      }

      await tx.creditPdfImportJob.update({
        where: { id: jobId },
        data: { effectsSettledAt: new Date() },
      });

      return { kind: "settled" as const, confirmed: alreadyConfirmed };
    });

    if (outcome === "skipped" || outcome === "settled") return outcome;
    logJob("effects_settled", {
      jobId,
      confirmed: outcome.confirmed,
    });
    return "settled";
  } catch {
    // No loguear message: puede incluir datos del reporte.
    logJob("effects_pending", { jobId });
    return "pending";
  }
}

export async function settlePendingSucceededCreditPdfImportEffects(
  limit: number,
): Promise<number> {
  const pendingConfirm = await prisma.creditPdfImportJob.findMany({
    where: {
      status: "SUCCEEDED",
      NOT: { phase: { in: ["confirmed", "confirming"] } },
    },
    orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
    take: Math.max(1, limit),
    select: { id: true },
  });
  for (const row of pendingConfirm) {
    await autoConfirmCreditPdfImportIfEligible(row.id);
  }

  const candidates = await prisma.creditPdfImportJob.findMany({
    where: {
      status: "SUCCEEDED",
      effectsSettledAt: null,
    },
    orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
    take: Math.max(1, limit),
    select: { id: true },
  });

  let settled = 0;
  for (const row of candidates) {
    const outcome = await settleSucceededCreditPdfImportEffects(row.id);
    if (outcome === "settled") settled += 1;
  }
  return settled;
}
