"use client";

import { useRouter } from "next/navigation";
import { FileBarChart } from "lucide-react";
import { AgencyModal } from "@/src/components/agency/agency-modal";
import { CreateCreditReportButton } from "@/src/components/credit-reports/create-report-button";
import { DocumentUploader } from "@/src/components/documents/document-uploader";
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
  clientId,
  caseId,
  canManage,
}: {
  clientId: string;
  caseId: string | null;
  canManage: boolean;
}) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="space-y-1 text-center">
        <p className="text-[15px] font-semibold text-ink">Sin reporte PDF</p>
        {canManage ? (
          <p className="text-[13px] text-text-secondary">
            El análisis corre en el servidor.
          </p>
        ) : null}
      </div>
      {canManage ? (
        <>
          <DocumentUploader
            clientId={clientId}
            caseId={caseId ?? undefined}
            wizard={false}
            hideCategoryStep
            initialCategory="CREDIT_REPORT"
            initialSensitivity="CONFIDENTIAL"
            allowUndo
            pdfOnly
            prominent
          />
          {caseId ? (
            <div className="flex justify-center">
              <CreateCreditReportButton
                caseId={caseId}
                label="Registrar sin PDF"
                variant="ghost"
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-center text-[13px] text-text-secondary">
          Tu rol no puede subir reportes.
        </p>
      )}
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
