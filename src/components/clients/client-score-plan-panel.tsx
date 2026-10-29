"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, CreditCard, Download, RotateCcw } from "lucide-react";
import { loadScorePlan } from "@/src/actions/score-plan";
import type { ScorePlanData } from "@/src/server/credit-reports/score-plan";
import {
  BAND_HINT,
  BAND_LABEL,
  DEFAULT_TARGET_PCT,
  bandFor,
  closeCardImpact,
  payToTarget,
  scorePlanCopy,
  totals,
  type UtilBand,
} from "@/src/lib/credit/utilization-plan";
import { allocateUtilizationBudget, parseExtraBudgetCents } from "@/src/lib/credit/budget";
import { RangeSlider, Select } from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";

/** Color por banda: texto con contraste AA y relleno de barra. */
const BAND_TONE: Record<UtilBand, { ink: string; fill: string; soft: string }> = {
  NONE: { ink: "text-text-secondary", fill: "bg-text-secondary", soft: "bg-nav-hover" },
  IDEAL: { ink: "text-success-ink", fill: "bg-success-ink", soft: "bg-success-soft" },
  OK: { ink: "text-info-ink", fill: "bg-info-ink", soft: "bg-info-soft" },
  HIGH: { ink: "text-warning-ink", fill: "bg-warning-ink", soft: "bg-warning-soft" },
  VERY_HIGH: { ink: "text-danger-ink", fill: "bg-danger-ink", soft: "bg-danger-soft" },
};

const TARGET_MIN = 1;
const TARGET_MAX = 50;

function usd(amount: number) {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function pct(bps: number | null) {
  return bps == null ? "Sin dato" : `${Math.round(bps / 100)}%`;
}

function BandChip({ band }: { band: UtilBand | null }) {
  if (!band) return null;
  const tone = BAND_TONE[band];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.soft} ${tone.ink}`}>
      {BAND_LABEL[band]}
    </span>
  );
}

/** Barra fina de uso por tarjeta (sin pista de fondo pesada). */
function MiniBar({ bps }: { bps: number }) {
  const band = bandFor(bps);
  return (
    <span className="relative block h-1 w-full overflow-hidden rounded-full bg-ink/[0.06]" aria-hidden>
      <span
        className={`absolute inset-y-0 left-0 rounded-full ${band ? BAND_TONE[band].fill : "bg-ink"}`}
        style={{ width: `${Math.max(Math.min(bps / 100, 100), bps > 0 ? 2 : 0)}%` }}
      />
    </span>
  );
}

function Disclosure({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-surface bg-surface-app">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-[13.5px] font-semibold text-ink">{title}</span>
          <span className="block text-[12px] text-text-secondary">{hint}</span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-text-secondary transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}

/**
 * Score Plan: bajar la utilización ya, aparte de la reparación. Niveles en vez
 * de puntos, meta ajustable con su orden de pago, y dos simulaciones a mano
 * (presupuesto del mes y cerrar una tarjeta). Se comparte como texto o PDF.
 */
export function ClientScorePlanPanel({ clientId, reportId }: { clientId: string; reportId: string | null }) {
  const [data, setData] = useState<ScorePlanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetPct, setTargetPct] = useState<number>(DEFAULT_TARGET_PCT);
  const [budget, setBudget] = useState("");
  const [closeKey, setCloseKey] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadScorePlan({ clientId, reportId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, reportId]);

  const cards = useMemo(() => data?.cards ?? [], [data]);
  const now = useMemo(() => totals(cards), [cards]);
  const plan = useMemo(() => payToTarget(cards, targetPct), [cards, targetPct]);
  const budgetCents = parseExtraBudgetCents(budget);
  const allocation = useMemo(() => {
    if (budgetCents == null || cards.length === 0) return null;
    return allocateUtilizationBudget({
      snapshotId: data?.reportId ?? "",
      extraBudgetCents: budgetCents,
      aggregateStatus: "KNOWN",
      accounts: cards.map((card) => ({
        canonicalId: card.key,
        creditorName: card.creditorName,
        balanceCents: Math.round(card.balance * 100),
        limitCents: Math.round(card.limit * 100),
        currency: "USD",
      })),
    });
  }, [budgetCents, cards, data?.reportId]);
  const closing = closeKey ? closeCardImpact(cards, closeKey) : null;
  // "Hoy" redondeado y tope del control (sube si hoy ya pasa de 50%).
  const currentPct =
    now.utilizationBps != null ? Math.min(Math.max(Math.round(now.utilizationBps / 100), TARGET_MIN), 100) : null;
  const targetMax = Math.max(TARGET_MAX, currentPct ?? 0);

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-40 animate-pulse rounded-surface bg-nav-hover" />
        <div className="h-28 animate-pulse rounded-surface bg-nav-hover" />
      </div>
    );
  }
  if (error) return <p className="text-center text-sm text-danger-ink">{error}</p>;
  if (!data || cards.length === 0) {
    return (
      <div className="rounded-surface bg-surface-app px-4 py-8 text-center">
        <CreditCard className="mx-auto size-6 text-text-secondary" aria-hidden />
        <p className="mt-2 text-[13px] text-text-secondary">
          El reporte no tiene tarjetas abiertas con límite. El Score Plan trabaja con tarjetas de crédito; para
          sumar una, el cliente puede abrir una tarjeta asegurada.
        </p>
      </div>
    );
  }

  const band = bandFor(now.utilizationBps);
  const targetBand = bandFor(targetPct * 100);
  const afterBand = bandFor(plan.afterBps);
  const marks = [
    { value: TARGET_MIN, label: `${TARGET_MIN}%` },
    { value: 10, label: "10%" },
    { value: 30, label: "30%" },
    { value: targetMax, label: `${targetMax}%` },
  ];

  async function copyPlan() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(scorePlanCopy({ clientName: data.clientName, cards, plan }));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
      active ? "bg-action-primary text-action-primary-foreground" : "bg-surface-panel text-ink hover:bg-nav-hover"
    }`;

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-text-secondary">
        {data.clientName}, reporte del {formatDate(data.reportDate)}. Usa {usd(now.balance)} de {usd(now.limit)} en{" "}
        {cards.length} tarjeta{cards.length === 1 ? "" : "s"}.
      </p>

      {/* Hoy y meta */}
      <section className="rounded-surface bg-surface-app p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[12px] text-text-secondary">Hoy</p>
            <p className={`mt-0.5 text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${band ? BAND_TONE[band].ink : "text-ink"}`}>
              {pct(now.utilizationBps)}
            </p>
            <div className="mt-1.5">
              <BandChip band={band} />
            </div>
          </div>
          <div>
            <p className="text-[12px] text-text-secondary">Meta</p>
            <p className="mt-0.5 text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
              {targetPct}%
            </p>
            <div className="mt-1.5">
              <BandChip band={targetBand} />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <RangeSlider
            value={targetPct}
            onChange={setTargetPct}
            min={TARGET_MIN}
            max={targetMax}
            marks={marks}
            label="Meta de utilización"
            valueText={`${targetPct}%`}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTargetPct(DEFAULT_TARGET_PCT)}
            aria-pressed={targetPct === DEFAULT_TARGET_PCT}
            className={chip(targetPct === DEFAULT_TARGET_PCT)}
          >
            <RotateCcw className="size-3" aria-hidden />
            Recomendado {DEFAULT_TARGET_PCT}%
          </button>
          {currentPct != null ? (
            <button
              type="button"
              onClick={() => setTargetPct(currentPct)}
              aria-pressed={targetPct === currentPct}
              className={chip(targetPct === currentPct)}
            >
              Hoy {currentPct}%
            </button>
          ) : null}
        </div>
        {band ? <p className="mt-3 text-[12px] text-text-secondary">{BAND_HINT[band]}</p> : null}
      </section>

      {/* Resultado y orden de pago */}
      <section>
        {plan.rows.length === 0 ? (
          <p className="flex items-center gap-2 rounded-control bg-success-soft px-3 py-2.5 text-[13px] text-success-ink">
            <Check className="size-4 shrink-0" aria-hidden />
            Ya está en la meta. Que mantenga los saldos así.
          </p>
        ) : (
          <>
            <p className="text-[15px] text-ink">
              Paga <span className="font-semibold tabular-nums">{usd(plan.totalPayment)}</span> y queda en{" "}
              <span className="font-semibold tabular-nums">{pct(plan.afterBps)}</span> <BandChip band={afterBand} />
            </p>
            <p className="mt-0.5 text-[12px] text-text-secondary">En este orden: la de mayor porcentaje primero.</p>
            <ol className="mt-2 divide-y divide-border-subtle/50">
              {plan.rows.map((row, index) => (
                <li key={row.key} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 py-2.5">
                  <span className="text-[12px] font-semibold tabular-nums text-text-secondary">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">{row.creditorName}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="w-16 shrink-0">
                        <MiniBar bps={row.nowBps} />
                      </span>
                      <span className="text-[11.5px] tabular-nums text-text-secondary">
                        {pct(row.nowBps)} a {pct(row.afterBps)}
                      </span>
                    </div>
                  </div>
                  <span className="text-[15px] font-semibold tabular-nums text-ink">{usd(row.payment)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {plan.alreadyIdeal.length > 0 ? (
          <p className="mt-2 text-[12px] text-text-secondary">
            Ya están bien (menos de 10%): {plan.alreadyIdeal.map((r) => `${r.creditorName} (${pct(r.nowBps)})`).join(", ")}.
          </p>
        ) : null}
      </section>

      {/* Simulaciones a mano */}
      <div className="space-y-2">
        <Disclosure title="Presupuesto del mes" hint="Reparte lo que puede pagar, además de los mínimos.">
          <label className="block">
            <span className="text-[12.5px] font-medium text-ink">Presupuesto extra</span>
            <span className="mt-1 flex items-center gap-2 rounded-control bg-surface-panel px-3 focus-within:ring-2 focus-within:ring-action-primary">
              <span className="text-[13px] text-text-secondary">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                placeholder="0"
                className="w-full bg-transparent py-2 text-[14px] tabular-nums text-ink outline-none"
              />
            </span>
            <span className="mt-1 block text-[11.5px] text-text-secondary">
              Lo dice el cliente. No se infiere del ingreso.
            </span>
          </label>
          {budget.trim() !== "" && budgetCents == null ? (
            <p className="mt-2 text-[12px] text-danger-ink">Escribe solo una cantidad, por ejemplo 150.</p>
          ) : null}
          {allocation?.complete && allocation.spentCents != null ? (
            <div className="mt-3 text-[13px]">
              <p className="text-ink">
                Queda en <span className="font-semibold tabular-nums">{pct(allocation.simulatedUtilizationBps)}</span>{" "}
                <BandChip band={bandFor(allocation.simulatedUtilizationBps)} />
              </p>
              <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-text-secondary">
                {allocation.cards
                  .filter((card) => card.paymentCents > 0)
                  .sort((a, b) => b.paymentCents - a.paymentCents)
                  .map((card) => (
                    <li key={card.canonicalId} className="flex justify-between gap-3">
                      <span className="truncate">{card.creditorName}</span>
                      <span className="tabular-nums text-ink">{usd(card.paymentCents / 100)}</span>
                    </li>
                  ))}
              </ul>
              {allocation.remainingCents != null && allocation.remainingCents > 0 ? (
                <p className="mt-1.5 text-[12px] text-text-secondary">
                  Sobran {usd(allocation.remainingCents / 100)}: todas las tarjetas quedan en $0.
                </p>
              ) : null}
            </div>
          ) : null}
        </Disclosure>

        <Disclosure title="¿Y si cierra una tarjeta?" hint="Pierde límite y sube el porcentaje.">
          <Select
            value={closeKey}
            onChange={(event) => setCloseKey(event.target.value)}
            pickerTitle="Tarjeta a cerrar"
            aria-label="Tarjeta a cerrar"
          >
            <option value="">Elige una tarjeta</option>
            {cards.map((card) => (
              <option key={card.key} value={card.key}>
                {card.creditorName}, límite {usd(card.limit)}
              </option>
            ))}
          </Select>
          {closing ? (
            <div className="mt-3 text-[13px]">
              <p className="text-ink">
                El uso pasaría de <span className="font-semibold tabular-nums">{pct(closing.beforeBps)}</span> a{" "}
                <span className={`font-semibold tabular-nums ${closing.afterBand ? BAND_TONE[closing.afterBand].ink : ""}`}>
                  {pct(closing.afterBps)}
                </span>
                {closing.afterBand && closing.afterBand !== closing.beforeBand ? (
                  <> ({BAND_LABEL[closing.beforeBand ?? "NONE"]} a {BAND_LABEL[closing.afterBand]})</>
                ) : null}
                .
              </p>
              <p className="mt-1 text-[12px] text-text-secondary">
                Mejor dejarla abierta y con poco uso, salvo que tenga una cuota anual que no le convenga.
              </p>
            </div>
          ) : null}
        </Disclosure>
      </div>

      {/* Consejos */}
      <section>
        <h3 className="text-[13.5px] font-semibold text-ink">Para que cuente</h3>
        <ul className="mt-1.5 space-y-1 text-[12.5px] text-text-secondary">
          <li>Pagar antes de la fecha de corte: ese es el saldo que el banco reporta.</li>
          <li>Dejar entre 1% y 9% en una sola tarjeta, no todas en $0.</li>
          <li>No cerrar tarjetas viejas. El cambio se ve en 30 a 45 días.</li>
        </ul>
        {/myfreescorenow/i.test(data.provider ?? "") ? (
          <p className="mt-2 text-[11.5px] text-text-secondary">
            MyFreeScoreNow da la fecha de reporte por mes; la fecha de corte exacta está en el estado de cuenta.
          </p>
        ) : null}
      </section>

      <p className="text-[11px] text-text-secondary">
        Estimación con los saldos y límites del reporte, no una garantía de puntaje. Es aparte de la reparación de
        cuentas negativas.
      </p>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 rounded-surface bg-surface-elevated px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={() => void copyPlan()}
          className="inline-flex items-center gap-1.5 rounded-control bg-nav-hover/70 px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-nav-hover active:scale-[0.98]"
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copiado" : "Copiar plan"}
        </button>
        <a
          href={`/api/clients/${clientId}/score-plan/pdf?reportId=${data.reportId}&target=${targetPct}`}
          className="inline-flex items-center gap-1.5 rounded-control bg-action-primary px-4 py-2 text-[13px] font-semibold text-action-primary-foreground transition-transform active:scale-[0.98]"
        >
          <Download className="size-3.5" aria-hidden />
          Descargar PDF
        </a>
      </div>
    </div>
  );
}
