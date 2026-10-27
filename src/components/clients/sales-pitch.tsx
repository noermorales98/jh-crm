"use client";

import { useState } from "react";
import Link from "next/link";
import { metricText, presentAmount } from "@/src/lib/credit/metrics-view";

function money(amount: number | null, currency: string | null) {
  return metricText(
    presentAmount({ amount, currency, status: amount == null ? "UNKNOWN" : "KNOWN" }),
  );
}

/**
 * Guion de venta a partir de la última cotización (estilo Fondify).
 * El total sale de la cotización; aquí solo se reparte en anticipo + meses.
 */
export function SalesPitch({
  clientFirstName,
  negatives,
  total,
  currency,
  quoteHref,
}: {
  clientFirstName: string;
  negatives: number;
  total: number | null;
  currency: string | null;
  quoteHref: string;
}) {
  const [upfrontPct, setUpfrontPct] = useState(30);
  const [months, setMonths] = useState(6);
  const [copied, setCopied] = useState(false);

  if (total == null || total <= 0) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-[13px] text-text-secondary">
          El guion usa el total de la cotización. Crea o actualiza la cotización
          de este cliente y vuelve aquí.
        </p>
        <Link href={quoteHref} className="text-sm font-medium text-action-primary">
          Abrir cotización →
        </Link>
      </div>
    );
  }

  const upfront = Math.round(total * upfrontPct) / 100;
  const safeMonths = Math.max(1, months);
  const monthly = Math.round(((total - upfront) / safeMonths) * 100) / 100;
  const marks =
    negatives > 0
      ? `limpiar tus ${negatives} marca${negatives === 1 ? "" : "s"} negativa${negatives === 1 ? "" : "s"}`
      : "ordenar y estructurar tu crédito";

  const script =
    `${clientFirstName}, según tu reporte, ${marks} es un trabajo que suma ${money(total, currency)}: ese es el valor real del caso. ` +
    `No te cobro eso hoy ni por adelantado. Arrancas con una asesoría de ${money(upfront, currency)} que recibes de inmediato (tu análisis, plan y estrategia) ` +
    `y el resto en ${safeMonths} pago${safeMonths === 1 ? "" : "s"} de ${money(monthly, currency)} al mes por el trabajo ya hecho. ` +
    "No prometemos resultados específicos y puedes cancelar sin costo dentro de los primeros días. ¿Arrancamos?";

  async function copy() {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Figure label="Valor total" value={money(total, currency)} />
        <Figure label="Asesoría hoy" value={money(upfront, currency)} />
        <Figure label={`${safeMonths} pagos de`} value={money(monthly, currency)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[13px]">
          <span className="mb-1 block font-medium text-ink">Asesoría hoy (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={upfrontPct}
            onChange={(e) => setUpfrontPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className="w-full rounded-control bg-surface-app px-3 py-2 text-sm ring-1 ring-border-subtle"
          />
        </label>
        <label className="block text-[13px]">
          <span className="mb-1 block font-medium text-ink">Meses</span>
          <input
            type="number"
            min={1}
            max={24}
            value={months}
            onChange={(e) => setMonths(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
            className="w-full rounded-control bg-surface-app px-3 py-2 text-sm ring-1 ring-border-subtle"
          />
        </label>
      </div>
      <blockquote className="rounded-control bg-surface-app px-4 py-3 text-[14px] leading-relaxed text-ink">
        {script}
      </blockquote>
      <p className="rounded-control bg-warning-soft px-3 py-2 text-[12px] text-warning-ink">
        CROA: no cobres por la reparación antes de realizar el trabajo, no prometas
        eliminaciones ni puntos, y entrega el contrato con el aviso de cancelación
        de 3 días hábiles. Revisa este esquema de cobro con tu asesor legal.
      </p>
      <button
        type="button"
        onClick={copy}
        className="w-full rounded-control bg-action-primary px-3 py-2 text-sm font-semibold text-action-primary-foreground active:scale-[0.98]"
      >
        {copied ? "Copiado" : "Copiar guion"}
      </button>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control px-2 py-2.5 ring-1 ring-border-subtle">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
