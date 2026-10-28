"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, CreditCard, Download } from "lucide-react";
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
import { formatDate } from "@/src/lib/format";

/** Color por banda: texto con contraste AA y relleno de barra. */
const BAND_TONE: Record<UtilBand, { ink: string; fill: string; soft: string }> = {
  NONE: { ink: "text-text-secondary", fill: "bg-text-secondary", soft: "bg-nav-hover" },
  IDEAL: { ink: "text-success-ink", fill: "bg-success-ink", soft: "bg-success-soft" },
  OK: { ink: "text-info-ink", fill: "bg-info-ink", soft: "bg-info-soft" },
  HIGH: { ink: "text-warning-ink", fill: "bg-warning-ink", soft: "bg-warning-soft" },
  VERY_HIGH: { ink: "text-danger-ink", fill: "bg-danger-ink", soft: "bg-danger-soft" },
};

const TARGETS = [
  { pct: 29, label: "Menos de 30%", hint: "Deja de restar" },
  { pct: DEFAULT_TARGET_PCT, label: "Menos de 10%", hint: "Lo ideal" },
] as const;

function usd(amount: number) {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function pct(bps: number | null) {
  return bps == null ? "—" : `${Math.round(bps / 100)}%`;
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

/** Barra 0–100% con marcas de 10% y 30%, y una marca de meta opcional. */
function Meter({ bps, targetPct, size = "lg" }: { bps: number | null; targetPct?: number; size?: "lg" | "sm" }) {
  const band = bandFor(bps);
  const width = bps == null ? 0 : Math.min(bps / 100, 100);
  const height = size === "lg" ? "h-2.5" : "h-1.5";
  return (
    <div className="relative">
      <div className={`relative ${height} overflow-hidden rounded-full bg-nav-hover`}>
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${band ? BAND_TONE[band].fill : "bg-ink"}`}
          style={{ width: `${Math.max(width, bps && bps > 0 ? 1.5 : 0)}%` }}
        />
      </div>
      {size === "lg" ? (
        <div className="relative mt-1 h-4 text-[10.5px] text-text-secondary" aria-hidden>
          {[10, 30].map((mark) => (
            <span key={mark} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${mark}%` }}>
              {mark}%
            </span>
          ))}
          {targetPct != null ? (
            <span
              className="absolute -top-[18px] h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-ink"
              style={{ left: `${Math.min(targetPct, 100)}%` }}
              title={`Meta ${targetPct}%`}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Score Plan: bajar la utilización ya, aparte de la reparación. Bandas en vez
 * de puntos, plan de pago por tarjeta, presupuesto del mes y simulación de
 * cerrar una tarjeta. Se comparte como texto o PDF.
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

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-36 animate-pulse rounded-surface bg-nav-hover" />
        <div className="h-24 animate-pulse rounded-surface bg-nav-hover" />
      </div>
    );
  }
  if (error) return <p className="text-center text-sm text-danger-ink">{error}</p>;
  if (!data || cards.length === 0) {
    return (
      <div className="rounded-surface bg-nav-hover/50 px-4 py-8 text-center">
        <CreditCard className="mx-auto size-6 text-text-secondary" aria-hidden />
        <p className="mt-2 text-[13px] text-text-secondary">
          El reporte no tiene tarjetas abiertas con límite. El Score Plan trabaja con tarjetas de crédito; para
          sumar una, el cliente puede abrir una tarjeta asegurada.
        </p>
      </div>
    );
  }

  const band = bandFor(now.utilizationBps);
  const afterBand = bandFor(plan.afterBps);

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

  return (
    <div className="space-y-5">
      {/* Hoy */}
      <section className="rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] text-text-secondary">
            {data.clientName} · reporte del {formatDate(data.reportDate)}
          </p>
          <BandChip band={band} />
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className={`text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${band ? BAND_TONE[band].ink : "text-ink"}`}>
            {pct(now.utilizationBps)}
          </p>
          <p className="text-[13px] text-text-secondary">
            Usas <span className="font-semibold text-ink tabular-nums">{usd(now.balance)}</span> de{" "}
            <span className="font-semibold text-ink tabular-nums">{usd(now.limit)}</span> en {cards.length} tarjeta
            {cards.length === 1 ? "" : "s"} abierta{cards.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="mt-4">
          <Meter bps={now.utilizationBps} targetPct={targetPct} />
        </div>
        {band ? <p className="mt-1 text-[12px] text-text-secondary">{BAND_HINT[band]}</p> : null}
      </section>

      {/* Meta y plan */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">Paga en este orden</h3>
            <p className="text-[12px] text-text-secondary">La de mayor porcentaje primero: es la que más resta.</p>
          </div>
          <div role="radiogroup" aria-label="Meta de utilización" className="flex gap-1 rounded-control bg-surface-app p-1">
            {TARGETS.map((target) => (
              <button
                key={target.pct}
                type="button"
                role="radio"
                aria-checked={targetPct === target.pct}
                onClick={() => setTargetPct(target.pct)}
                className={`rounded-[7px] px-2.5 py-1 text-left transition-colors ${
                  targetPct === target.pct ? "bg-surface-elevated shadow-sm" : "hover:bg-nav-hover"
                }`}
              >
                <span className="block text-[12px] font-semibold text-ink">{target.label}</span>
                <span className="block text-[10.5px] text-text-secondary">{target.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {plan.rows.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 rounded-control bg-success-soft px-3 py-2.5 text-[13px] text-success-ink">
            <Check className="size-4" aria-hidden />
            Todas las tarjetas ya están en la meta. Mantén los saldos así.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-border-subtle/60 overflow-hidden rounded-surface ring-1 ring-border-subtle">
            {plan.rows.map((row, index) => (
              <li key={row.key} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 bg-surface-panel px-3 py-2.5">
                <span className="text-[12px] font-semibold tabular-nums text-text-secondary">{index + 1}</span>
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-ink">{row.creditorName}</p>
                    <p className="shrink-0 text-[11.5px] tabular-nums text-text-secondary">
                      {usd(row.balance)} de {usd(row.limit)}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1">
                      <Meter bps={row.nowBps} size="sm" />
                    </div>
                    <span className="w-24 shrink-0 text-right text-[11.5px] tabular-nums text-text-secondary">
                      {pct(row.nowBps)} → <span className="font-semibold text-ink">{pct(row.afterBps)}</span>
                    </span>
                  </div>
                </div>
                <p className="text-right">
                  <span className="block text-[10.5px] text-text-secondary">Paga</span>
                  <span className="text-[15px] font-semibold tabular-nums text-ink">{usd(row.payment)}</span>
                </p>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 bg-surface-app px-3 py-2.5">
              <span className="text-[13px] font-semibold text-ink">
                Total <span className="font-normal text-text-secondary">· quedarías en {pct(plan.afterBps)}</span>{" "}
                <BandChip band={afterBand} />
              </span>
              <span className="text-[17px] font-semibold tabular-nums text-ink">{usd(plan.totalPayment)}</span>
            </li>
          </ol>
        )}
        {plan.alreadyIdeal.length > 0 ? (
          <p className="mt-2 text-[12px] text-text-secondary">
            Ya están bien (menos de 10%):{" "}
            {plan.alreadyIdeal.map((r) => `${r.creditorName} (${pct(r.nowBps)})`).join(" · ")}
          </p>
        ) : null}
      </section>

      {/* Presupuesto */}
      <section className="rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle">
        <label className="block">
          <span className="text-[14px] font-semibold text-ink">Presupuesto extra</span>
          <span className="mt-0.5 block text-[12px] text-text-secondary">
            ¿Cuánto puede pagar este mes además de los mínimos? No se infiere del ingreso.
          </span>
          <span className="mt-2 flex items-center gap-2 rounded-control bg-surface-app px-3 ring-1 ring-border-subtle focus-within:ring-2 focus-within:ring-action-primary">
            <span className="text-[14px] text-text-secondary">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              placeholder="0"
              className="w-full bg-transparent py-2.5 text-[14px] tabular-nums text-ink outline-none"
            />
          </span>
        </label>
        {budget.trim() !== "" && budgetCents == null ? (
          <p className="mt-2 text-[12px] text-danger-ink">Escribe solo una cantidad, por ejemplo 150.</p>
        ) : null}
        {allocation?.complete && allocation.spentCents != null ? (
          <div className="mt-3 space-y-1.5 text-[13px]">
            <p className="text-ink">
              Con {usd((budgetCents ?? 0) / 100)} quedaría en{" "}
              <span className="font-semibold tabular-nums">{pct(allocation.simulatedUtilizationBps)}</span>{" "}
              <BandChip band={bandFor(allocation.simulatedUtilizationBps)} />
            </p>
            <ul className="space-y-0.5 text-[12.5px] text-text-secondary">
              {allocation.cards
                .filter((card) => card.paymentCents > 0)
                .sort((a, b) => b.paymentCents - a.paymentCents)
                .map((card) => (
                  <li key={card.canonicalId} className="flex justify-between gap-3">
                    <span>{card.creditorName}</span>
                    <span className="tabular-nums text-ink">{usd(card.paymentCents / 100)}</span>
                  </li>
                ))}
            </ul>
            {allocation.remainingCents != null && allocation.remainingCents > 0 ? (
              <p className="text-[12px] text-text-secondary">
                Sobran {usd(allocation.remainingCents / 100)}: todas las tarjetas quedan en $0.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Cerrar una tarjeta */}
      <section className="rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle">
        <label className="block">
          <span className="text-[14px] font-semibold text-ink">¿Y si cierra una tarjeta?</span>
          <select
            value={closeKey}
            onChange={(event) => setCloseKey(event.target.value)}
            className="mt-2 w-full rounded-control bg-surface-app px-3 py-2.5 text-[13px] text-ink ring-1 ring-border-subtle"
          >
            <option value="">Elige una tarjeta para simular…</option>
            {cards.map((card) => (
              <option key={card.key} value={card.key}>
                {card.creditorName} — límite {usd(card.limit)}
              </option>
            ))}
          </select>
        </label>
        {closing ? (
          <div className="mt-3 space-y-1 text-[13px]">
            <p className="text-ink">
              Pierde {usd(closing.lostLimit)} de límite. El uso pasaría de{" "}
              <span className="font-semibold tabular-nums">{pct(closing.beforeBps)}</span> a{" "}
              <span className={`font-semibold tabular-nums ${closing.afterBand ? BAND_TONE[closing.afterBand].ink : ""}`}>
                {pct(closing.afterBps)}
              </span>
              {closing.afterBand && closing.afterBand !== closing.beforeBand ? (
                <> ({BAND_LABEL[closing.beforeBand ?? "NONE"]} → {BAND_LABEL[closing.afterBand]})</>
              ) : null}
              .
            </p>
            <p className="text-[12px] text-text-secondary">
              Con el tiempo también baja la antigüedad. Mejor déjala abierta y con poco uso, salvo que tenga una
              cuota anual que no le convenga.
            </p>
          </div>
        ) : null}
      </section>

      {/* Consejos */}
      <section>
        <h3 className="text-[15px] font-semibold text-ink">Cómo hacerlo para que cuente</h3>
        <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {[
            ["Paga antes de la fecha de corte", "El banco reporta el saldo del estado de cuenta, no el del día que pagas."],
            ["Deja un poco en una tarjeta", "Entre 1% y 9% en una sola; todas en $0 puede verse como crédito sin uso."],
            ["No cierres tarjetas viejas", "Pierdes límite (sube el porcentaje) y, con el tiempo, antigüedad."],
            ["Espera el reporte del banco", "El cambio aparece cuando cada banco reporta, normalmente en 30 a 45 días."],
          ].map(([title, body]) => (
            <div key={title}>
              <dt className="text-[13px] font-medium text-ink">{title}</dt>
              <dd className="mt-0.5 text-[12px] text-text-secondary">{body}</dd>
            </div>
          ))}
        </dl>
        {/myfreescorenow/i.test(data.provider ?? "") ? (
          <p className="mt-3 text-[11.5px] text-text-secondary">
            MyFreeScoreNow da la fecha de reporte por mes, no por día: la fecha de corte exacta está en el estado de
            cuenta de cada tarjeta.
          </p>
        ) : null}
      </section>

      <p className="text-[11px] text-text-secondary">
        Estimación con los saldos y límites del reporte. No es una garantía de puntaje: cada modelo (FICO,
        VantageScore) pesa la utilización a su manera. Es aparte de la reparación de cuentas negativas.
      </p>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-2 rounded-surface bg-surface-elevated px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] ring-1 ring-border-subtle">
        <button
          type="button"
          onClick={() => void copyPlan()}
          className="inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-[13px] font-medium text-ink ring-1 ring-border-subtle transition-colors hover:bg-nav-hover"
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copiado" : "Copiar plan para el cliente"}
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
