import Link from "next/link";
import { FileBarChart, RefreshCcw } from "lucide-react";

/**
 * Acceso unificado a crédito y rondas desde el Action Center.
 */
export function ClientCreditRoundsPanel({
  caseId,
  reportHref,
  avanceHref,
  reportsCount,
  roundNumber,
  negativeCount,
}: {
  caseId: string | null;
  reportHref: string | null;
  avanceHref: string | null;
  reportsCount: number;
  roundNumber: number | null;
  negativeCount: number;
}) {
  if (!caseId) {
    return (
      <div className="mx-auto max-w-lg rounded-surface bg-surface-panel px-4 py-8 text-center">
        <p className="text-[15px] font-semibold text-ink">Sin expediente de crédito</p>
        <p className="mt-2 text-[13px] text-text-secondary">
          Crea un servicio de Credit Repair con Añadir → Servicios para ver
          reportes y rondas.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <div className="rounded-surface bg-surface-panel px-4 py-3">
        <p className="text-[12px] font-medium text-text-secondary">Resumen</p>
        <p className="mt-1 text-[14px] text-ink">
          {reportsCount} reporte{reportsCount === 1 ? "" : "s"}
          {" · "}
          {roundNumber != null ? `Ronda ${roundNumber}` : "Sin ronda activa"}
          {" · "}
          {negativeCount} negativo{negativeCount === 1 ? "" : "s"}
        </p>
      </div>

      <Link
        href={reportHref ?? `/crm/casos/${caseId}/credito`}
        className="flex items-center gap-3 rounded-surface bg-surface-panel px-4 py-3 transition-colors hover:bg-surface-elevated"
      >
        <span className="flex size-9 items-center justify-center rounded-[10px] bg-action-primary/10 text-action-primary">
          <FileBarChart className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">
            Ver crédito
          </span>
          <span className="block text-[13px] text-text-secondary">
            Reportes, scores y cuentas
          </span>
        </span>
      </Link>

      <Link
        href={avanceHref ?? `/crm/casos/${caseId}/rondas`}
        className="flex items-center gap-3 rounded-surface bg-surface-panel px-4 py-3 transition-colors hover:bg-surface-elevated"
      >
        <span className="flex size-9 items-center justify-center rounded-[10px] bg-action-primary/10 text-action-primary">
          <RefreshCcw className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">
            Centro de rondas
          </span>
          <span className="block text-[13px] text-text-secondary">
            Disputas y avance por ronda
          </span>
        </span>
      </Link>
    </div>
  );
}
