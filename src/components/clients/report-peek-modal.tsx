"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { CreditBureau } from "@prisma/client";
import { Alert, Modal } from "@/src/components/ui";
import { peekReportAction } from "@/src/actions/client-overview";
import { ScoreDelta } from "@/src/components/credit-reports/bureau-score-strip";
import {
  CREDIT_BUREAU_LABELS,
  CREDIT_REPORT_TYPE_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { formatDate } from "@/src/lib/format";

type PeekData = Extract<
  Awaited<ReturnType<typeof peekReportAction>>,
  { ok: true }
>["data"];

const BUREAUS: CreditBureau[] = ["EXPERIAN", "EQUIFAX", "TRANSUNION"];

export function ReportPeekModal({
  reportId,
  caseId,
  onClose,
}: {
  reportId: string | null;
  caseId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<PeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = !!reportId;

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    startTransition(async () => {
      setData(null);
      setError(null);
      const result = await peekReportAction(reportId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setData(null);
        return;
      }
      setError(null);
      setData(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  return (
    <Modal
      open={open}
      onClose={() => {
        setData(null);
        setError(null);
        onClose();
      }}
      title={data ? data.label : "Reporte"}
      description={data ? formatDate(data.reportDate) : undefined}
    >
      {pending && !data && !error ? (
        <p className="text-sm text-text-secondary">Cargando…</p>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {data ? (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-text-secondary">Fecha</dt>
              <dd className="tabular-nums">{formatDate(data.reportDate)}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Tipo</dt>
              <dd>{labelFor(CREDIT_REPORT_TYPE_LABELS, data.type)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-text-secondary">Proveedor</dt>
              <dd>{data.provider ?? "—"}</dd>
            </div>
          </dl>

          <ul className="space-y-1.5">
            {BUREAUS.map((b) => (
              <li
                key={b}
                className="flex items-center justify-between gap-3 tabular-nums"
              >
                <span className="text-text-secondary">
                  {CREDIT_BUREAU_LABELS[b]}
                </span>
                <span className="font-medium text-ink">
                  {data.scores[b] ?? "—"}{" "}
                  <ScoreDelta value={data.deltas[b] ?? null} />
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-secondary">
            Diferencia contra el reporte anterior (si existe). No implica
            causalidad con rondas.
          </p>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-text-secondary">Activos</p>
              <p className="font-semibold tabular-nums text-ink">
                {data.itemsActive}
              </p>
            </div>
            <div>
              <p className="text-text-secondary">Resueltos</p>
              <p className="font-semibold tabular-nums text-ink">
                {data.itemsResolved}
              </p>
            </div>
            <div>
              <p className="text-text-secondary">Negativos</p>
              <p className="font-semibold tabular-nums text-ink">
                {data.itemsNegative}
              </p>
            </div>
          </div>

          {data.comparisonAvailable && data.comparisonHref ? (
            <p className="text-xs text-text-secondary">
              Comparación disponible.{" "}
              <Link
                href={data.comparisonHref}
                className="font-medium text-action-primary hover:text-action-secondary"
                onClick={onClose}
              >
                Ver comparación
              </Link>
            </p>
          ) : (
            <p className="text-xs text-text-secondary">
              Sin comparación registrada para este reporte.
            </p>
          )}

          {data.nearbyEvents.length > 0 ? (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                Eventos cercanos en el tiempo
              </p>
              <ul className="mt-1 space-y-1 text-xs">
                {data.nearbyEvents.map((ev) => (
                  <li
                    key={`${ev.kind}-${ev.roundId}-${String(ev.at)}`}
                    className="flex justify-between gap-2 text-text-secondary"
                  >
                    <span>{ev.label}</span>
                    <span className="tabular-nums">{formatDate(ev.at)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] text-text-placeholder">
                Proximidad temporal; no afirma causa–efecto.
              </p>
            </div>
          ) : null}

          <Link
            href={`/crm/casos/${caseId}/credito/reportes/${data.id}`}
            className="inline-flex h-8 items-center rounded-control bg-surface-panel px-3 text-xs font-medium text-ink ring-1 ring-border-subtle hover:bg-nav-hover"
            onClick={onClose}
          >
            Ver reporte completo
          </Link>
        </div>
      ) : null}
    </Modal>
  );
}
