"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Minus, X } from "lucide-react";
import { loadFundingCalc, saveFundingProfileAction } from "@/src/actions/funding-calc";
import type { FundingCalcData } from "@/src/server/credit-reports/funding";
import {
  FUNDING_DISCLAIMER,
  TIME_IN_BUSINESS_LABEL,
  computeFunding,
  type FundingProfile,
  type FundingResult,
  type ProductResult,
  type TimeInBusiness,
} from "@/src/lib/credit/funding-calc";
import { formatDate } from "@/src/lib/format";
import { Select } from "@/src/components/ui";

function usd(amount: number) {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function rangeText(range: { low: number; high: number }) {
  return range.low === range.high ? usd(range.low) : `${usd(range.low)} a ${usd(range.high)}`;
}

const STATUS: Record<FundingResult["status"], { label: string; tone: string }> = {
  READY: { label: "Listo para fondeo", tone: "bg-success-soft text-success-ink" },
  NOT_YET: { label: "Aún no califica", tone: "bg-warning-soft text-warning-ink" },
  MISSING_DATA: { label: "Faltan datos", tone: "bg-nav-hover text-ink" },
};

const PRODUCT_STATUS: Record<ProductResult["status"], { label: string; tone: string }> = {
  READY: { label: "Cumple", tone: "bg-success-soft text-success-ink" },
  NOT_YET: { label: "Aún no", tone: "bg-warning-soft text-warning-ink" },
  MISSING_DATA: { label: "Faltan datos", tone: "bg-nav-hover text-text-secondary" },
};

function parseMoney(raw: string): number | null {
  const text = raw.replace(/[$,\s]/g, "");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function MoneyField({
  label,
  hint,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  hint?: string;
  value: number | null;
  placeholder?: string;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink">{label}</span>
      <span className="mt-1 flex items-center gap-2 rounded-control bg-surface-panel px-3 focus-within:ring-2 focus-within:ring-action-primary">
        <span className="text-[13px] text-text-secondary">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={placeholder ?? "0"}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => onCommit(parseMoney(text))}
          className="w-full bg-transparent py-2 text-[13.5px] tabular-nums text-ink outline-none"
        />
      </span>
      {hint ? <span className="mt-1 block text-[11.5px] text-text-secondary">{hint}</span> : null}
    </label>
  );
}

/**
 * Calculadora de fondeo: lee el reporte, pide lo mínimo al cliente (ingreso,
 * ventas, tiempo del negocio) y dice en palabras simples si califica hoy,
 * cuánto podría conseguir y qué le falta. Sin aprobaciones ni promesas.
 */
export function ClientFundingPanel({ clientId, reportId }: { clientId: string; reportId: string | null }) {
  const [data, setData] = useState<FundingCalcData | null>(null);
  const [profile, setProfile] = useState<FundingProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const saveSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadFundingCalc({ clientId, reportId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setData(res.data);
      setProfile(res.data.profile);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, reportId]);

  const result = useMemo(() => (data && profile ? computeFunding(data.facts, profile) : null), [data, profile]);

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-32 animate-pulse rounded-surface bg-nav-hover" />
        <div className="h-40 animate-pulse rounded-surface bg-nav-hover" />
      </div>
    );
  }
  if (error || !data || !profile || !result) {
    return <p className="text-center text-sm text-danger-ink">{error ?? "No se pudo cargar el fondeo."}</p>;
  }

  function update(next: Partial<FundingProfile>) {
    if (!profile) return;
    const merged = { ...profile, ...next };
    setProfile(merged);
    const seq = ++saveSeq.current;
    setSaveState("saving");
    void saveFundingProfileAction({ clientId, profile: merged }).then((res) => {
      if (seq !== saveSeq.current) return;
      setSaveState(res.ok ? "saved" : "error");
    });
  }

  const status = STATUS[result.status];
  const facts = data.facts;
  const summaryBits = [
    result.referenceScore != null ? `Puntaje de referencia ${result.referenceScore}` : null,
    facts.utilizationBps != null ? `uso de tarjetas ${Math.round(facts.utilizationBps / 100)}%` : null,
    facts.inquiries6m != null ? `${facts.inquiries6m} consulta${facts.inquiries6m === 1 ? "" : "s"} en 6 meses` : null,
    `${facts.blockingNegatives} negativa${facts.blockingNegatives === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const productName = (id: string) => result.products.find((p) => p.id === id)?.name ?? "";

  async function copySummary() {
    if (!data || !result) return;
    const lines = [`Tu camino al fondeo: ${data.clientName}`];
    if (result.best) {
      lines.push(`Hoy podrías calificar para ${productName(result.best.product).toLowerCase()}: ${rangeText(result.best)} (estimado).`);
    } else if (result.bestPotential) {
      lines.push(`Hoy todavía no calificas. Al terminar la reparación podrías llegar a ${rangeText(result.bestPotential)} en ${productName(result.bestPotential.product).toLowerCase()} (estimado).`);
    } else {
      lines.push("Todavía no calificas para fondeo.");
    }
    if (result.todo.length > 0) {
      lines.push("", "Lo que falta:");
      result.todo.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
    }
    lines.push("", "Es un estimado, no una aprobación: cada prestamista decide con sus propias reglas y documentos.");
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Resultado */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-text-secondary">
            {data.clientName} · reporte del {formatDate(data.reportDate)}
          </p>
          <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${status.tone}`}>{status.label}</span>
        </div>
        {result.best ? (
          <>
            <p className="mt-3 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
              {rangeText(result.best)}
            </p>
            <p className="mt-1.5 text-[13px] text-text-secondary">
              Estimado hoy en {productName(result.best.product).toLowerCase()}.
            </p>
          </>
        ) : result.bestPotential ? (
          <>
            <p className="mt-3 text-[13px] text-text-secondary">Al terminar la reparación podría llegar a</p>
            <p className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
              {rangeText(result.bestPotential)}
            </p>
            <p className="mt-1.5 text-[13px] text-text-secondary">
              en {productName(result.bestPotential.product).toLowerCase()}. Hoy todavía no califica.
            </p>
          </>
        ) : (
          <p className="mt-3 text-[15px] font-medium text-ink">
            {result.status === "MISSING_DATA"
              ? "Completa los datos del cliente para calcular cuánto podría conseguir."
              : "Hoy no califica y con estos datos no hay un monto estimado."}
          </p>
        )}
        <p className="mt-3 text-[12px] text-text-secondary">{summaryBits.join(" · ")}</p>
      </section>

      {/* Qué falta */}
      {result.todo.length > 0 ? (
        <section className="rounded-surface bg-surface-app p-4">
          <h3 className="text-[14px] font-semibold text-ink">Qué falta</h3>
          <ol className="mt-2 space-y-1.5">
            {result.todo.map((item, index) => (
              <li key={item} className="flex gap-2.5 text-[13px] text-ink">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-panel text-[11px] font-semibold tabular-nums">
                  {index + 1}
                </span>
                <span className="pt-0.5">{item}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Datos del cliente */}
      <section className="rounded-surface bg-surface-app p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-semibold text-ink">Datos del cliente</h3>
          <span className="text-[11.5px] text-text-secondary" aria-live="polite">
            {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado" : saveState === "error" ? "No se pudo guardar" : "Se guardan en su ficha"}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[12.5px] font-medium text-ink">¿Tiene negocio?</span>
          <div role="radiogroup" aria-label="¿Tiene negocio?" className="flex gap-1 rounded-control bg-surface-panel p-1">
            {[
              { value: false, label: "No" },
              { value: true, label: "Sí" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={profile.hasBusiness === option.value}
                onClick={() => update({ hasBusiness: option.value })}
                className={`rounded-[7px] px-3 py-1 text-[12.5px] font-medium transition-colors ${
                  profile.hasBusiness === option.value
                    ? "bg-action-primary text-action-primary-foreground"
                    : "text-text-secondary hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <MoneyField
            label="Ingreso personal al mes"
            hint="Antes de impuestos. Lo declara el cliente; se verifica con talones o impuestos."
            value={profile.monthlyIncome}
            onCommit={(value) => update({ monthlyIncome: value })}
          />
          <MoneyField
            label="Pagos de deudas al mes"
            hint={
              data.facts.reportMonthlyDebt != null
                ? `Del reporte: ${usd(data.facts.reportMonthlyDebt)}. Escribe otro si sabes que es distinto (renta no incluida).`
                : "El reporte no trae pagos; escríbelos si los sabes."
            }
            placeholder={data.facts.reportMonthlyDebt != null ? String(Math.round(data.facts.reportMonthlyDebt)) : "0"}
            value={profile.monthlyDebtOverride}
            onCommit={(value) => update({ monthlyDebtOverride: value })}
          />
          {profile.hasBusiness ? (
            <>
              <MoneyField
                label="Ventas del negocio al mes"
                hint="Lo que entra al banco del negocio, en promedio."
                value={profile.monthlyRevenue}
                onCommit={(value) => update({ monthlyRevenue: value })}
              />
              <div className="block">
                <span className="text-[12.5px] font-medium text-ink">Tiempo operando</span>
                <div className="mt-1">
                  <Select
                    value={profile.timeInBusiness ?? ""}
                    onChange={(event) =>
                      update({ timeInBusiness: event.target.value ? (event.target.value as TimeInBusiness) : null })
                    }
                    pickerTitle="Tiempo operando"
                    aria-label="Tiempo operando"
                  >
                    <option value="">Elige</option>
                    {(Object.keys(TIME_IN_BUSINESS_LABEL) as TimeInBusiness[]).map((key) => (
                      <option key={key} value={key}>
                        {TIME_IN_BUSINESS_LABEL[key]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {/* Productos */}
      <section>
        <h3 className="text-[14px] font-semibold text-ink">Opciones de fondeo</h3>
        <ul className="mt-2 divide-y divide-border-subtle/50">
          {result.products.map((product) => {
            const chip = PRODUCT_STATUS[product.status];
            const expanded = open[product.id] ?? false;
            return (
              <li key={product.id} className="py-3">
                <button
                  type="button"
                  onClick={() => setOpen((prev) => ({ ...prev, [product.id]: !prev[product.id] }))}
                  aria-expanded={expanded}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{product.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.tone}`}>{chip.label}</span>
                    </span>
                    <span className="mt-0.5 block text-[12px] text-text-secondary">{product.hint}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-right">
                      {product.range ? (
                        <span className="block text-[14px] font-semibold tabular-nums text-ink">{rangeText(product.range)}</span>
                      ) : product.potential ? (
                        <>
                          <span className="block text-[10.5px] text-text-secondary">Después de reparar</span>
                          <span className="block text-[13px] font-semibold tabular-nums text-text-secondary">
                            {rangeText(product.potential)}
                          </span>
                        </>
                      ) : (
                        <span className="block text-[12.5px] text-text-secondary">Sin monto</span>
                      )}
                    </span>
                    <ChevronDown
                      className={`size-4 text-text-secondary transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </span>
                </button>
                {expanded ? (
                  <div className="mt-2.5 rounded-control bg-surface-app px-3 py-2.5">
                    <ul className="space-y-1.5">
                      {product.checks.map((check) => (
                        <li key={check.label} className="flex gap-2 text-[12.5px]">
                          {check.state === "OK" ? (
                            <Check className="mt-0.5 size-3.5 shrink-0 text-success-ink" aria-label="Cumple" />
                          ) : check.state === "FAIL" ? (
                            <X className="mt-0.5 size-3.5 shrink-0 text-danger-ink" aria-label="No cumple" />
                          ) : (
                            <Minus className="mt-0.5 size-3.5 shrink-0 text-text-secondary" aria-label="Falta dato" />
                          )}
                          <span>
                            <span className="font-medium text-ink">{check.label}:</span>{" "}
                            <span className="text-text-secondary">{check.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {product.note ? <p className="mt-2 text-[11.5px] text-text-secondary">{product.note}</p> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!profile.hasBusiness ? (
          <p className="mt-1 text-[12px] text-text-secondary">
            Si el cliente tiene negocio, marca &quot;Sí&quot; para ver la línea de crédito y el SBA.
          </p>
        ) : null}
      </section>

      <p className="text-[11px] leading-relaxed text-text-secondary">
        {FUNDING_DISCLAIMER} Si el reporte trae VantageScore (como MyFreeScoreNow), el FICO que usa el prestamista puede ser
        distinto.
      </p>

      <div className="sticky bottom-0 flex justify-end rounded-surface bg-surface-elevated px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={() => void copySummary()}
          className="inline-flex items-center gap-1.5 rounded-control bg-action-primary px-4 py-2 text-[13px] font-semibold text-action-primary-foreground transition-transform active:scale-[0.98]"
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copiado" : "Copiar resumen para el cliente"}
        </button>
      </div>
    </div>
  );
}
