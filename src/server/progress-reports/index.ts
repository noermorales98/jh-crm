import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import { clientFullName } from "@/src/server/page-helpers";
import { generateClientProgressPdf } from "@/src/lib/pdf/client-progress";
import { formatForPdf } from "@/src/lib/format/dates";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import * as disputes from "@/src/server/disputes";
import * as creditReports from "@/src/server/credit-reports";
import type { Prisma } from "@prisma/client";

export type ProgressScoreSnapshot = {
  bureau: string;
  score: number | null;
  delta: number | null;
};

export type ProgressResultsSnapshot = {
  deleted: number;
  updated: number;
  pending: number;
  verified?: number;
};

async function getOrgPdfInfo(organizationId: string) {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  const addressLine = [
    settings?.addressLine1,
    settings?.addressLine2,
    [settings?.city, settings?.state, settings?.postalCode].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
  return {
    legalName: settings?.legalName ?? "J&H Multiservices LLC",
    phone: settings?.phone,
    email: settings?.email,
    website: settings?.website,
    addressLine: addressLine || null,
    timezone: settings?.timezone ?? "America/Chicago",
  };
}

function asScores(json: Prisma.JsonValue): ProgressScoreSnapshot[] {
  if (!Array.isArray(json)) return [];
  return json.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      bureau: String(r.bureau ?? ""),
      score: typeof r.score === "number" ? r.score : null,
      delta: typeof r.delta === "number" ? r.delta : null,
    };
  });
}

function asResults(json: Prisma.JsonValue): ProgressResultsSnapshot {
  const r = (json && typeof json === "object" && !Array.isArray(json)
    ? json
    : {}) as Record<string, unknown>;
  return {
    deleted: Number(r.deleted ?? 0),
    updated: Number(r.updated ?? 0),
    pending: Number(r.pending ?? 0),
    ...(typeof r.verified === "number" ? { verified: r.verified } : {}),
  };
}

function asLines(json: Prisma.JsonValue): string[] {
  if (!Array.isArray(json)) return [];
  return json.map((line) => String(line));
}

/**
 * Crea snapshot del reporte visual en BD (sin PDF ni S3).
 * No incluye SSN, notas internas ni datos de otros clientes.
 */
export async function createClientProgressReport(
  ctx: OrganizationContext,
  data: { caseId: string; roundId?: string | null; nextSteps?: string | null },
) {
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: data.caseId, organizationId: ctx.organizationId },
    include: { client: true },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const overview = await creditReports.getCaseCreditOverview(ctx, creditCase.id);
  const round = data.roundId
    ? await prisma.creditRound.findFirst({
        where: {
          id: data.roundId,
          organizationId: ctx.organizationId,
          caseId: creditCase.id,
        },
      })
    : await prisma.creditRound.findFirst({
        where: { organizationId: ctx.organizationId, caseId: creditCase.id },
        orderBy: { roundNumber: "desc" },
      });

  let results: ProgressResultsSnapshot = {
    deleted: 0,
    updated: 0,
    pending: 0,
    verified: 0,
  };
  const resultLines: string[] = [];
  if (round) {
    const summary = await disputes.getRoundDisputeSummary(ctx, round.id);
    results = {
      deleted: summary.byOutcome.deleted,
      updated: summary.byOutcome.updated,
      verified: summary.byOutcome.verified,
      pending: summary.byOutcome.pending + summary.byOutcome.notResponded,
    };
    for (const item of summary.items) {
      const outcome = item.outcome ?? "pendiente";
      resultLines.push(
        `${item.creditItem.creditorName} (${CREDIT_BUREAU_LABELS[item.bureau]}): ${outcome}`,
      );
    }
  }

  const org = await getOrgPdfInfo(ctx.organizationId);
  const firstDate = overview.history[0]?.reportDate;
  const lastDate = overview.history[overview.history.length - 1]?.reportDate;
  const periodLabel =
    firstDate && lastDate
      ? `${formatForPdf(firstDate, org.timezone)} – ${formatForPdf(lastDate, org.timezone)}`
      : "Sin reportes";

  const scores: ProgressScoreSnapshot[] = overview.current.map((c) => ({
    bureau: CREDIT_BUREAU_LABELS[c.bureau],
    score: c.score,
    delta: c.delta,
  }));

  const nextSteps =
    data.nextSteps?.trim() ||
    "Continuar el seguimiento según el plan acordado y revisar el próximo reporte de crédito.";

  const reportDate = new Date();

  return prisma.$transaction(async (tx) => {
    const report = await tx.clientProgressReport.create({
      data: {
        organizationId: ctx.organizationId,
        caseId: creditCase.id,
        roundId: round?.id ?? null,
        createdById: ctx.userId,
        clientName: clientFullName(creditCase.client),
        caseCode: creditCase.caseCode,
        periodLabel,
        roundLabel: round ? `Ronda #${round.roundNumber}` : "Sin ronda",
        reportDate,
        scoresJson: scores,
        resultsJson: results,
        resultLinesJson: resultLines,
        nextSteps,
        nextReviewAt: creditCase.nextReviewAt ?? round?.expectedReviewAt ?? null,
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "PROGRESS_REPORT_GENERATED",
        description: "Reporte visual de progreso generado para el cliente",
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        roundId: round?.id ?? null,
        metadata: { reportId: report.id },
      },
      tx,
    );

    return report;
  });
}

/** @deprecated Prefer createClientProgressReport */
export const generateAndStoreClientProgressReport = createClientProgressReport;

export async function listProgressReportsForCase(
  ctx: OrganizationContext,
  caseId: string,
) {
  return prisma.clientProgressReport.findMany({
    where: { organizationId: ctx.organizationId, caseId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      caseId: true,
      roundId: true,
      periodLabel: true,
      roundLabel: true,
      reportDate: true,
      createdAt: true,
    },
  });
}

export async function listProgressReportsForRound(
  ctx: OrganizationContext,
  roundId: string,
) {
  return prisma.clientProgressReport.findMany({
    where: { organizationId: ctx.organizationId, roundId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      caseId: true,
      roundId: true,
      periodLabel: true,
      roundLabel: true,
      reportDate: true,
      createdAt: true,
    },
  });
}

export async function getProgressReport(
  ctx: OrganizationContext,
  reportId: string,
) {
  const report = await prisma.clientProgressReport.findFirst({
    where: { id: reportId, organizationId: ctx.organizationId },
  });
  if (!report) throw new DomainError("Reporte de progreso no encontrado.");
  return report;
}

/** PDF on-demand desde el snapshot (sin persistir). */
export async function buildProgressReportPdf(
  ctx: OrganizationContext,
  reportId: string,
): Promise<{ pdf: Buffer; filename: string }> {
  const report = await getProgressReport(ctx, reportId);
  if (report.organizationId !== ctx.organizationId) {
    throw new DomainError("Reporte de progreso no encontrado.");
  }
  const org = await getOrgPdfInfo(ctx.organizationId);
  const pdf = generateClientProgressPdf({
    organization: {
      legalName: org.legalName,
      phone: org.phone,
      email: org.email,
      website: org.website,
      addressLine: org.addressLine,
    },
    clientName: report.clientName,
    caseCode: report.caseCode,
    periodLabel: report.periodLabel,
    roundLabel: report.roundLabel,
    reportDate: report.reportDate,
    scores: asScores(report.scoresJson),
    results: asResults(report.resultsJson),
    resultLines: asLines(report.resultLinesJson),
    nextReviewAt: report.nextReviewAt,
    nextSteps: report.nextSteps,
    timezone: org.timezone,
  });
  const day = report.reportDate.toISOString().slice(0, 10);
  return {
    pdf,
    filename: `progreso-${report.caseCode}-${day}.pdf`,
  };
}
