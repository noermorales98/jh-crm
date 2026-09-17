import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/src/server/auth/guards";
import { DomainError } from "@/src/server/errors";
import { getCreditPdfImportJob } from "@/src/server/credit-import/jobs";
import { CreditPdfImportProgressClient } from "@/src/components/credit-reports/credit-pdf-import-progress";

export const metadata: Metadata = {
  title: "Importación PDF",
};

export default async function CreditPdfImportJobPage({
  params,
}: {
  params: Promise<{ caseId: string; jobId: string }>;
}) {
  const { caseId, jobId } = await params;
  const ctx = await requirePermission("creditReports.manage");

  let job: Awaited<ReturnType<typeof getCreditPdfImportJob>>;
  try {
    job = await getCreditPdfImportJob(ctx, jobId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  if (job.caseId !== caseId) notFound();

  const initialJob = {
    id: job.id,
    caseId: job.caseId,
    documentId: job.documentId,
    status: job.status,
    phase: job.phase,
    phaseLabel: job.phaseLabel,
    progress: job.progress,
    fileName: job.fileName,
    errorMessage: job.errorMessage,
    extractMode: job.extractMode,
    pageCount: job.pageCount,
    suggestedReportType: job.suggestedReportType,
    proposal: job.proposal,
    currentClient: job.currentClient,
    progressPath: job.progressPath,
  };

  return (
    <CreditPdfImportProgressClient
      caseId={caseId}
      jobId={jobId}
      initialJob={initialJob}
    />
  );
}
