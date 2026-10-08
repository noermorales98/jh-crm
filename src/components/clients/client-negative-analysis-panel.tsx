"use client";

import { useEffect, useState } from "react";
import {
  loadClientNegativeAnalysis,
  type ClientNegativeAnalysisDto,
} from "@/src/actions/credit-reports";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";

export function ClientNegativeAnalysisPanel({
  clientId,
  reportId,
}: {
  clientId: string;
  reportId: string | null;
}) {
  const [analysis, setAnalysis] = useState<ClientNegativeAnalysisDto | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadClientNegativeAnalysis({ clientId, reportId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setAnalysis(null);
        return;
      }
      setAnalysis(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, reportId]);

  if (loading) {
    return (
      <p className="rounded-surface bg-nav-hover/50 px-4 py-6 text-center text-[13px] text-text-secondary">
        Cargando análisis…
      </p>
    );
  }

  if (error) {
    return <p className="text-center text-sm text-danger">{error}</p>;
  }

  if (!analysis || analysis.negativeCount === 0) {
    return (
      <p className="rounded-surface bg-nav-hover/50 px-4 py-6 text-center text-[13px] text-text-secondary">
        No hay cuentas negativas cargadas (o no hay reporte parseado).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-[12px] text-text-secondary">
          {analysis.clientName} · análisis del reporte
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-4">
          <div>
            <p className="text-[28px] font-semibold tabular-nums text-danger-ink">
              {analysis.negativeCount}
            </p>
            <p className="text-[12px] text-text-secondary">cuentas negativas</p>
          </div>
          <div>
            <p className="text-[28px] font-semibold tabular-nums text-ink">
              {analysis.totalItems}
            </p>
            <p className="text-[12px] text-text-secondary">cuentas en total</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {analysis.groups.map((g) => (
            <span
              key={g.key}
              className="rounded-full bg-nav-hover px-3 py-1 text-[11px] font-medium text-ink"
            >
              {g.title}: {g.count}
            </span>
          ))}
        </div>
      </div>

      {analysis.groups.map((g) => (
        <section
          key={g.key}
          className="rounded-surface bg-nav-hover/40 px-3 py-3 text-left"
        >
          <h3 className="text-[14px] font-semibold text-ink">
            {g.title}{" "}
            <span className="text-text-secondary">· {g.count}</span>
          </h3>
          <p className="mt-1 text-[12px] text-text-secondary">{g.description}</p>
          <ul className="mt-2 space-y-2">
            {g.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-panel px-3 py-2 text-[13px]"
              >
                <span className="min-w-0">
                  <span className="font-medium text-ink">
                    {item.creditorName}
                  </span>
                  <span className="mt-0.5 block text-[11px] uppercase text-text-secondary">
                    {item.label}
                  </span>
                </span>
                <span className="text-[11px] font-medium text-text-secondary">
                  {(CREDIT_BUREAU_LABELS[item.bureau] ?? item.bureau).slice(
                    0,
                    2,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
