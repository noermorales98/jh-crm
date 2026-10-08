import Link from "next/link";
import { ExternalLink } from "lucide-react";

export function ClientCreditReportPdfView({
  clientId,
  clientName,
  reportDateLabel,
  fileName,
  documentId,
}: {
  clientId: string;
  clientName: string;
  reportDateLabel: string;
  fileName: string;
  documentId: string;
}) {
  const inlineHref = `/api/files/${documentId}/download?inline=1`;

  return (
    <div className="space-y-4">
      <Link
        href={`/crm/clientes/${clientId}`}
        className="inline-flex text-[13px] font-medium text-action-primary"
      >
        ← Volver a {clientName}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Reporte de crédito
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-ink">
            {clientName}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Reporte del {reportDateLabel}
            {fileName ? ` · ${fileName}` : ""}
          </p>
        </div>
        <a
          href={inlineHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-control bg-surface-panel px-3 py-2 text-sm font-medium text-ink ring-1 ring-border-subtle transition-colors hover:bg-nav-hover"
        >
          <ExternalLink className="size-4" aria-hidden />
          Abrir en pestaña nueva
        </a>
      </div>

      <div className="overflow-hidden rounded-surface bg-surface-panel ring-1 ring-border-subtle">
        <iframe
          title={fileName || "Reporte de crédito"}
          src={`${inlineHref}#view=FitH`}
          className="w-full border-0 bg-surface-app"
          style={{ height: "calc(100dvh - 14rem)", minHeight: 640 }}
        />
      </div>
    </div>
  );
}
