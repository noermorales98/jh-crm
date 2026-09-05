import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import * as progressService from "@/src/server/progress-reports";
import { ProgressReportHtmlView } from "@/src/components/letters/progress-report-html-view";

export const metadata: Metadata = {
  title: "Reporte de progreso",
};

function asScores(json: Prisma.JsonValue) {
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

function asResults(json: Prisma.JsonValue) {
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

function asLines(json: Prisma.JsonValue) {
  if (!Array.isArray(json)) return [];
  return json.map((line) => String(line));
}

export default async function ProgressReportPage({
  params,
}: {
  params: Promise<{ caseId: string; reportId: string }>;
}) {
  const { caseId, reportId } = await params;
  const ctx = await requireOrganization();
  if (!can(ctx.role, "letters.view")) notFound();

  let report: Awaited<ReturnType<typeof progressService.getProgressReport>>;
  try {
    report = await progressService.getProgressReport(ctx, reportId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  if (report.caseId !== caseId) notFound();

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  const contact = [
    settings?.addressLine1,
    settings?.phone,
    settings?.email,
  ]
    .filter(Boolean)
    .join(" · ");

  const backHref = report.roundId
    ? `/crm/casos/${caseId}/rondas/${report.roundId}`
    : `/crm/casos/${caseId}/credito`;

  return (
    <ProgressReportHtmlView
      organizationName={settings?.legalName ?? "J&H Multiservices LLC"}
      organizationContact={contact || null}
      clientName={report.clientName}
      caseCode={report.caseCode}
      periodLabel={report.periodLabel}
      roundLabel={report.roundLabel}
      reportDate={report.reportDate}
      timezone={settings?.timezone ?? "America/Chicago"}
      scores={asScores(report.scoresJson)}
      results={asResults(report.resultsJson)}
      resultLines={asLines(report.resultLinesJson)}
      nextReviewAt={report.nextReviewAt}
      nextSteps={report.nextSteps}
      downloadHref={`/api/progress-reports/${report.id}/pdf`}
      backHref={backHref}
    />
  );
}
