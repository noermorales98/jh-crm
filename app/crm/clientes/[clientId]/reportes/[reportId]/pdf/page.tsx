import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as creditReports from "@/src/server/credit-reports";
import { DomainError } from "@/src/server/errors";
import { clientFullName } from "@/src/server/page-helpers";
import { formatDate } from "@/src/lib/format";
import { ClientCreditReportPdfView } from "@/src/components/clients/client-credit-report-pdf-view";

export const metadata: Metadata = {
  title: "Reporte de crédito (PDF)",
};

export default async function ClientCreditReportPdfPage({
  params,
}: {
  params: Promise<{ clientId: string; reportId: string }>;
}) {
  const { clientId, reportId } = await params;
  const ctx = await requireOrganization();

  if (!can(ctx.role, "creditReports.view")) {
    notFound();
  }

  let report: Awaited<ReturnType<typeof creditReports.getReportDetail>>;
  try {
    report = await creditReports.getReportDetail(ctx, reportId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  if (report.clientId !== clientId) notFound();

  const documentId = report.documentId;
  const mime = report.document?.mimeType ?? "";
  const name =
    report.document?.displayName || report.document?.originalName || "";
  const isPdf =
    documentId != null &&
    (mime === "application/pdf" || /\.pdf$/i.test(name));

  if (!isPdf || !documentId) {
    notFound();
  }

  const clientName = clientFullName(report.case.client);

  return (
    <ClientCreditReportPdfView
      clientId={clientId}
      clientName={clientName}
      reportDateLabel={formatDate(report.reportDate)}
      fileName={name}
      documentId={documentId}
    />
  );
}
