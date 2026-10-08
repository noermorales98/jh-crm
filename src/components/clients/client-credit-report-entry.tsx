"use client";

import { useRouter } from "next/navigation";
import { FileBarChart } from "lucide-react";
import { AgencyModal } from "@/src/components/agency/agency-modal";
import { AnalyzePdfImportButton } from "@/src/components/credit-reports/analyze-pdf-import";
import { CreateCreditReportButton } from "@/src/components/credit-reports/create-report-button";
import { formatDate } from "@/src/lib/format";
import { CREDIT_REPORT_TYPE_LABELS, labelFor } from "@/src/lib/labels";
export type CreditReportPdfDto = {
  id: string;
  caseId: string;
  reportDate: string;
  type: string;
  documentId: string;
  fileName: string;
};

/**
 * Lógica Fondify: 0 → empty, 1 → PDF directo, N → lista → PDF.
 */
export function useCreditReportEntry({
  clientId,
  pdfReports,
}: {
  clientId: string;
  pdfReports: CreditReportPdfDto[];
}) {
  const router = useRouter();

  function openReport(reportId: string) {
    router.push(`/crm/clientes/${clientId}/reportes/${reportId}/pdf`);
  }

  function enterCreditReport(): "empty" | "list" | "opened" {
    if (pdfReports.length === 0) return "empty";
    if (pdfReports.length === 1) {
      openReport(pdfReports[0]!.id);
      return "opened";
    }
    return "list";
  }

  return { enterCreditReport, openReport };
}

export function CreditReportEmptyPanel({
  caseId,
  canManage,
}: {
  caseId: string | null;
  canManage: boolean;
}) {
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-surface bg-nav-hover/50 px-4 py-8 text-center">
      <p className="text-[15px] font-semibold text-ink">Sin reporte PDF</p>
      <p className="text-[13px] text-text-secondary">
        Sube o analiza un PDF de crédito para verlo aquí.
      </p>
      {canManage && caseId ? (
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <AnalyzePdfImportButton caseId={caseId} label="Subir / analizar PDF" />
          <CreateCreditReportButton caseId={caseId} />
        </div>
      ) : null}
    </div>
  );
}

export function CreditReportListModal({
  open,
  onClose,
  reports,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  reports: CreditReportPdfDto[];
  onSelect: (reportId: string) => void;
}) {
  return (
    <AgencyModal
      open={open}
      onClose={onClose}
      title="Reportes de crédito"
      size="md"
    >
      <ul className="divide-y divide-border-subtle">
        {reports.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className="flex w-full items-start gap-3 px-1 py-3 text-left transition-colors hover:bg-nav-hover/60"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-action-primary/10 text-action-primary">
                <FileBarChart className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">
                  {formatDate(r.reportDate)}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-text-secondary">
                  {r.fileName} · {labelFor(CREDIT_REPORT_TYPE_LABELS, r.type)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </AgencyModal>
  );
}
