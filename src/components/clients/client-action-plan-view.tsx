"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Eye,
  Info,
  Sparkles,
  Landmark,
  ListChecks,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import type {
  ActionPlanPriority,
  ClientActionPlan,
} from "@/src/server/credit-reports/action-plan";
import { Modal } from "@/src/components/ui";
import { MarkdownText } from "@/src/components/ai/markdown-text";
import { summarizeCreditAnalysisAction } from "@/src/actions/credit-analysis-ai";
import { CREDIT_BUREAU_LABELS, CREDIT_NEGATIVE_TYPE_LABELS } from "@/src/lib/labels";
import { ACTION_KIND_LABEL, ACTION_PRIORITY_LABEL } from "@/src/lib/credit/actions";
import { ACTION_PLAN_POINT_IMPACT_UNAVAILABLE } from "@/src/lib/credit/action-plan-howto";
import { formatDate } from "@/src/lib/format";
import { metricText, presentAmount, presentUtilization } from "@/src/lib/credit/metrics-view";
import { NEWER_INCOMPLETE_IMPORT_NOTE } from "@/src/lib/credit/report-selection";

/** Umbrales internos (mismos que el servidor). */
const SCORE_MIN = 720;
const UTIL_MAX = 10;
const INQUIRY_MAX = 3;
const AU_MAX = 3;
const AGE_IDEAL_MONTHS = 36;

type Tone = "info" | "success" | "purple" | "warning" | "danger";

const TONE: Record<Tone, { soft: string; ink: string }> = {
  info: { soft: "bg-info-soft", ink: "text-info-ink" },
  success: { soft: "bg-success-soft", ink: "text-success-ink" },
  purple: { soft: "bg-purple-soft", ink: "text-purple-ink" },
  warning: { soft: "bg-warning-soft", ink: "text-warning-ink" },
  danger: { soft: "bg-danger-soft", ink: "text-danger-ink" },
};

/** Color fijo por buró (mismo en gráficas, leyendas y matriz). */
const BUREAU_COLOR: Record<string, string> = {
  EQUIFAX: "light-dark(#c8364f, #f27088)",
  EXPERIAN: "light-dark(#2f5bd3, #7d9cff)",
  TRANSUNION: "light-dark(#0b8f8a, #3cc9c1)",
};

function bureauColor(bureau: string): string {
  return BUREAU_COLOR[bureau] ?? "var(--color-text-secondary)";
}

/** Cambia a true tras el primer frame: dispara las animaciones de entrada. */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return mounted;
}

const CARD_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

type Rating = { label: string; tone: Tone };

function rateScore(score: number | null): Rating {
  if (score == null) return { label: "Sin dato", tone: "warning" };
  return score >= SCORE_MIN
    ? { label: "Excelente", tone: "success" }
    : { label: "Necesita mejorar", tone: "danger" };
}

function rateUtil(util: number | null): Rating {
  if (util == null) return { label: "Sin dato", tone: "warning" };
  return util <= UTIL_MAX
    ? { label: "Excelente", tone: "success" }
    : { label: "Necesita mejorar", tone: "danger" };
}

function rateAggregateUtil(util: number | null): Rating {
  if (util == null) return { label: "Sin dato", tone: "warning" };
  return util <= UTIL_MAX
    ? { label: "Excelente", tone: "success" }
    : { label: `Por encima del ${UTIL_MAX}%`, tone: "danger" };
}

function money(value: number | null, currency: string | null): string {
  return metricText(
    presentAmount({
      amount: value,
      currency,
      status: value == null ? "UNKNOWN" : "KNOWN",
    }),
  );
}

function utilText(basisPoints: number | null): string {
  return metricText(
    presentUtilization({
      basisPoints,
      status: basisPoints == null ? "UNKNOWN" : "KNOWN",
    }),
  );
}

/** Porcentaje numérico para dibujar barras (no para mostrar). */
function utilPercent(b: { utilizationBps: number | null; utilization: number | null }) {
  return b.utilizationBps != null ? b.utilizationBps / 100 : b.utilization;
}

function years(months: number | null): string {
  if (months == null) return "sin dato";
  return `${Math.round(months / 1.2) / 10} años`;
}

function bureauList(names: string[]): string {
  return names.join(", ");
}

export function ClientActionPlanView({
  plan,
  organizationName,
  backHref,
  backLabel,
  accountsHref,
}: {
  plan: ClientActionPlan;
  organizationName: string;
  backHref?: string;
  backLabel?: string;
  /** Detalle técnico del reporte (cuentas, fechas). */
  accountsHref?: string;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [howTo, setHowTo] = useState<ActionPlanPriority | null>(null);
  const [activeCard, setActiveCard] = useState<number | null>(null);

  const label = (b: ClientActionPlan["bureaus"][number]) =>
    CREDIT_BUREAU_LABELS[b.bureau] ?? b.bureau;
  const scoreFails = plan.bureaus.filter((b) => !b.scoreOk).map(label);
  const utilFails = plan.bureaus
    .filter((b) => b.utilization != null && !b.utilOk)
    .map(label);
  const utilUnknown = plan.bureaus.every((b) => b.utilization == null);
  const inquiryFails = plan.bureaus
    .filter((b) => b.inquiries != null && b.inquiries > INQUIRY_MAX)
    .map(label);
  const ageFails = plan.bureaus
    .filter((b) => b.avgAgeMonths == null || b.avgAgeMonths < AGE_IDEAL_MONTHS)
    .map(label);
  const negativeBureaus = plan.bureaus.filter((b) => b.blockingNegatives > 0).map(label);
  const oldLates = plan.negativeAccounts.filter((n) => n.old).length;

  const cards = dedupeCards(plan.revolving.cards);
  const highCards = cards.filter((c) => (c.utilizationBps ?? 0) > 3000).length;
  const overLimit = cards.filter((c) => (c.utilizationBps ?? 0) > 10000).length;
  const fundingLabel = plan.qualified ? "En revisión" : "Califica primero";

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={backHref ?? `/crm/clientes/${plan.clientId}`}
          className="inline-flex text-[13px] font-medium text-action-primary"
        >
          ← {backLabel ?? `Volver a ${plan.clientName}`}
        </Link>
        {accountsHref ? (
          <Link
            href={accountsHref}
            className="inline-flex text-[13px] font-medium text-action-primary"
          >
            Ver cuentas del reporte →
          </Link>
        ) : null}
      </div>

      <header className="space-y-3 text-center">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-ink">
          Análisis de Crédito y Plan de Acción
        </h1>
        <p className="text-[13px] font-medium uppercase tracking-wide text-text-secondary">
          {organizationName}
        </p>
        <p className="text-[14px] text-ink">
          Analizando a: <strong>{plan.clientName}</strong>
        </p>
        <p className="text-[12px] text-text-secondary">
          Reporte del {formatDate(plan.reportDate, "UTC")}
        </p>
        {plan.newerIncompleteReport ? (
          <p className="text-[12px] text-text-secondary">
            {NEWER_INCOMPLETE_IMPORT_NOTE}
          </p>
        ) : null}
        <a
          href={`/api/clients/${plan.clientId}/action-plan/pdf?reportId=${plan.reportId}`}
          className="inline-flex items-center rounded-control px-3 py-1.5 text-[13px] font-medium text-action-primary ring-1 ring-border-subtle hover:bg-nav-hover"
        >
          Descargar PDF
        </a>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Chip tone={plan.qualified ? "success" : "danger"}>
            {plan.qualified
              ? "Calificado en al menos un buró"
              : "No calificado actualmente"}
          </Chip>
          <Chip tone="warning">Estimado de fondeo: {fundingLabel}</Chip>
          <Chip tone="purple">
            {plan.bureausApproved} de 3 burós aprobados
          </Chip>
        </div>
      </header>

      <AiSummary reportId={plan.reportId} />

      <Section n={1} tone="info" icon={TrendingUp} title="Desglose por Buró (Equifax, Experian, TransUnion)">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink">
              Comparación de Puntajes
            </p>
            <BarChart
              bars={plan.bureaus.map((b) => ({
                label: label(b),
                value: b.score,
                display: b.score?.toString() ?? "Sin dato",
                color: bureauColor(b.bureau),
              }))}
              min={550}
              max={850}
              threshold={SCORE_MIN}
            />
            <RatingList
              rows={plan.bureaus.map((b) => ({
                label: label(b),
                value: b.score?.toString() ?? "Sin dato",
                rating: rateScore(b.score),
              }))}
            />
            <p className="mt-2 text-[11px] text-text-secondary">
              {scoreFails.length > 0
                ? `Uno o más burós no alcanzan el umbral de ${SCORE_MIN}`
                : `Los 3 burós alcanzan el umbral de ${SCORE_MIN}`}
            </p>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink">
              Utilización de Crédito
            </p>
            <BarChart
              bars={plan.bureaus.map((b) => ({
                label: label(b),
                value: utilPercent(b),
                display: b.utilizationText,
                color: bureauColor(b.bureau),
              }))}
              min={0}
              max={Math.max(
                25,
                ...plan.bureaus.map((b) => Math.ceil(utilPercent(b) ?? 0)),
              )}
              threshold={UTIL_MAX}
            />
            <RatingList
              rows={plan.bureaus.map((b) => ({
                label: label(b),
                value: b.utilizationText,
                rating: rateUtil(b.utilization),
              }))}
            />
            <p className="mt-2 text-[11px] text-text-secondary">
              {utilUnknown
                ? "El reporte no trae límites de tarjetas para calcular la utilización"
                : utilFails.length > 0
                ? `Uno o más burós superan el umbral de ${UTIL_MAX}%`
                : `Los 3 burós están dentro del ${UTIL_MAX}%`}
            </p>
            {!utilUnknown ? (
              <p className="mt-1 text-[11px] text-text-secondary">
                {plan.bureaus.every((b) => b.utilizationSource === "bureau")
                  ? "Fuente: resumen oficial de cada buró (incluye lo que el buró reporta como abierto)."
                  : "Fuente: tarjetas abiertas de cada buró (saldo / límite)."}
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDetailOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[12px] font-medium text-ink ring-1 ring-border-subtle hover:bg-nav-hover"
        >
          <Eye className="size-3.5" aria-hidden />
          {detailOpen ? "Ocultar detalle completo" : "Ver detalle completo"}
        </button>
        {detailOpen ? (
          <ul className="list-disc space-y-2 pl-5 text-[13px] text-text-secondary">
            <li>
              Puntaje de crédito ({plan.bureaus.map((b) => `${label(b)} ${b.score ?? "Sin dato"}`).join(", ")}):{" "}
              {scoreFails.length > 0 ? (
                <>
                  <strong className="text-ink">Necesita mejorar</strong>:{" "}
                  {bureauList(scoreFails)} no alcanza el mínimo de {SCORE_MIN} puntos.
                </>
              ) : (
                <>
                  <strong className="text-ink">Excelente</strong>: los 3 burós
                  alcanzan {SCORE_MIN}+.
                </>
              )}
            </li>
            <li>
              Utilización de crédito ({plan.bureaus.map((b) => `${label(b)} ${b.utilizationText}`).join(", ")}):{" "}
              {utilFails.length > 0 ? (
                <>
                  <strong className="text-ink">Necesita mejorar</strong>:{" "}
                  {bureauList(utilFails)} supera el {UTIL_MAX}%.
                </>
              ) : (
                <>
                  <strong className="text-ink">Excelente</strong>: los 3 burós
                  quedan en {UTIL_MAX}% o menos.
                </>
              )}
            </li>
            <li>
              Hard inquiries ({plan.bureaus.map((b) => `${label(b)} ${b.inquiries ?? "Sin dato"}`).join(", ")}
              {plan.bureaus[0]?.inquiriesNote ? `, ${plan.bureaus[0].inquiriesNote}` : ""}):{" "}
              {inquiryFails.length > 0 ? (
                <>
                  <strong className="text-ink">Necesita mejorar</strong>:{" "}
                  {bureauList(inquiryFails)} tiene más de {INQUIRY_MAX} consultas.
                </>
              ) : (
                <>
                  <strong className="text-ink">Bueno</strong>: los 3 burós
                  tienen {INQUIRY_MAX} consultas o menos.
                </>
              )}
            </li>
            <li>
              Edad promedio de crédito ({plan.bureaus.map((b) => `${label(b)} ${years(b.avgAgeMonths)}`).join(", ")}):{" "}
              {ageFails.length > 0 ? (
                <>
                  <strong className="text-ink">Necesita mejorar</strong>:{" "}
                  {bureauList(ageFails)} no llega a los 3+ años ideales.
                </>
              ) : (
                <>
                  <strong className="text-ink">Excelente</strong>: alcanza
                  los 3+ años ideales en los 3 burós.
                </>
              )}
            </li>
            <li>
              Historial de pagos:{" "}
              {negativeBureaus.length > 0 ? (
                <>
                  <strong className="text-ink">Necesita mejorar</strong>:{" "}
                  {bureauList(negativeBureaus)} reporta negativos que bloquean fondeo (
                  {plan.negativeCount} de {plan.totalItems} cuentas).
                  {oldLates > 0
                    ? ` ${oldLates} atraso${oldLates === 1 ? "" : "s"} de más de 3 años no cuenta${oldLates === 1 ? "" : "n"}.`
                    : ""}
                </>
              ) : (
                <>
                  <strong className="text-ink">Bueno</strong>: sin negativos que
                  bloqueen fondeo
                  {oldLates > 0 ? ` (${oldLates} atraso${oldLates === 1 ? "" : "s"} de más de 3 años)` : ""}.
                </>
              )}
            </li>
          </ul>
        ) : null}
      </Section>

      <Section
        n={2}
        tone="success"
        icon={CreditCard}
        title="Estructura de Crédito Rotativo"
        subtitle="Tarjetas abiertas por tipo de titular y utilización"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Kpi
            label="Tarjetas abiertas"
            value={plan.revolving.openCards?.toString() ?? "Sin dato"}
            hint={`${plan.revolving.primaryCards ?? "Sin dato"} Principal, ${plan.revolving.auCards} AU`}
          />
          <Kpi
            label="Límite total"
            value={money(plan.revolving.totalLimit, plan.revolving.currency)}
            hint={`${money(plan.revolving.totalUsed, plan.revolving.currency)} usado`}
          />
          <Kpi
            label="Tarjetas ≥ 2 000"
            value={String(plan.revolving.cardsGe2k)}
            hint={`${plan.revolving.cardsGe2k} de ${plan.revolving.openCards ?? "Sin dato"}`}
          />
          <Kpi
            label="Tarjetas ≥ 5 000"
            value={String(plan.revolving.cardsGe5k)}
            hint={plan.revolving.cardsGe5k === 0 ? "Ninguna" : undefined}
          />
          <Kpi
            label="Utilización"
            value={utilText(plan.revolving.utilizationBps)}
            hint={
              plan.revolving.aggregateStatus === "KNOWN"
                ? rateAggregateUtil(plan.revolving.utilPct).label
                : plan.revolving.coverageLabel
            }
          />
        </div>

        {cards.length > 0 ? (
          <div className="grid items-center gap-5 md:grid-cols-[220px_1fr]">
            <Donut
              slices={cards.map((c, i) => ({
                value: c.limit ?? 0,
                color: CARD_COLORS[i % CARD_COLORS.length],
                label: c.creditorName,
              }))}
              center={
                activeCard != null && cards[activeCard]
                  ? money(cards[activeCard].limit, cards[activeCard].currency)
                  : money(plan.revolving.totalLimit, plan.revolving.currency)
              }
              active={activeCard}
              onActive={setActiveCard}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-text-secondary">
                  <tr>
                    <th className="py-1.5 font-medium">Emisor</th>
                    <th className="py-1.5 text-right font-medium">Límite</th>
                    <th className="py-1.5 text-right font-medium">Usado</th>
                    <th className="py-1.5 text-right font-medium">Util</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c, i) => (
                    <tr
                      key={`${c.creditorName}-${i}`}
                      className={`border-t border-border-subtle transition-colors ${
                        activeCard === i ? "bg-nav-hover" : ""
                      }`}
                      onMouseEnter={() => setActiveCard(i)}
                      onMouseLeave={() => setActiveCard(null)}
                    >
                      <td className="py-2 text-ink">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-[3px]"
                            style={{ background: CARD_COLORS[i % CARD_COLORS.length] }}
                            aria-hidden
                          />
                          {c.creditorName}
                          <span className="rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info-ink">
                            Principal
                          </span>
                        </span>
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums text-ink">
                        {money(c.limit, c.currency)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {money(c.balance, c.currency)}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums ${
                          (c.utilizationBps ?? 0) > 3000 ? "font-semibold text-danger-ink" : "text-text-secondary"
                        }`}
                      >
                        {c.openStatusUnknown ? "Sin dato" : utilText(c.utilizationBps)}
                        {(c.utilizationBps ?? 0) > 10000 ? (
                          <span className="ml-1.5 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium">
                            Sobre el límite
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">
            Sin tarjetas rotativas leídas en este reporte.
          </p>
        )}

        <Callout tone="success" title="Análisis">
          <ul className="space-y-1">
            <li>
              Tarjetas abiertas: {plan.revolving.openCards ?? "Sin dato"} en total,{" "}
              {plan.revolving.primaryCards ?? "Sin dato"} primarias y{" "}
              {plan.revolving.auCards} usuarios autorizados.
            </li>
            <li>Límite total combinado: {money(plan.revolving.totalLimit, plan.revolving.currency)}.</li>
            <li>
              Tarjetas con límite ≥ 2 000: {plan.revolving.cardsGe2k} de{" "}
              {plan.revolving.openCards ?? "Sin dato"}.
            </li>
            {highCards > 0 ? (
              <li className="font-medium text-danger-ink">
                {highCards} tarjeta{highCards === 1 ? "" : "s"} por encima del 30% de
                uso{overLimit > 0 ? `, ${overLimit} sobre su límite` : ""}. Bajar esos
                saldos antes del corte es lo que más rápido mueve el puntaje.
              </li>
            ) : null}
            <li>
              {plan.revolving.cardsGe5k > 0
                ? `Tarjetas con límite ≥ 5 000: ${plan.revolving.cardsGe5k}.`
                : "Sin tarjetas con límite ≥ 5 000."}
            </li>
          </ul>
        </Callout>
      </Section>

      <Section
        n={3}
        tone="purple"
        icon={Users}
        title="Estrategia de Usuario Autorizado (AU)"
        subtitle="Cuentas de usuario autorizado y su impacto en el potencial de financiamiento"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi
            label="Cuentas AU activas"
            value={String(plan.authorizedUsers.confirmedCount)}
            hint={`máx ${AU_MAX}`}
          />
          <Kpi
            label="Tarjetas primarias"
            value={plan.revolving.primaryCards?.toString() ?? "Sin dato"}
          />
          <Kpi
            label="Tope de AU usado"
            value={`${Math.min(plan.authorizedUsers.confirmedCount, AU_MAX)} / ${AU_MAX}`}
          />
          <Kpi
            label="Espacio para agregar"
            value={String(Math.max(AU_MAX - plan.authorizedUsers.confirmedCount, 0))}
            hint={plan.authorizedUsers.confirmedCount < AU_MAX ? "Sí" : "No"}
            valueTone={plan.authorizedUsers.confirmedCount < AU_MAX ? "success" : undefined}
          />
        </div>

        {plan.authorizedUsers.accounts.length > 0 ? (
          <ul className="space-y-2">
            {plan.authorizedUsers.accounts.map((account) => (
              <li
                key={`${account.creditorName}-${account.sourceReportDate}`}
                className="rounded-control px-3 py-2 text-[13px] ring-1 ring-border-subtle"
              >
                <span className="font-medium text-ink">{account.creditorName}</span>
                <span className="text-text-secondary">
                  {" "}
                  · {account.bureaus.join(", ")} · límite {money(account.limit, null)} ·
                  saldo {money(account.balance, null)} ·{" "}
                  {account.ageMonths == null ? "edad sin dato" : years(account.ageMonths)}
                  {account.reportedNegative ? " · negativo reportado" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Callout tone="warning" icon={AlertTriangle} title="Sin Cuentas AU Activas">
            No hay cuentas AU activas en este perfil crediticio.
          </Callout>
        )}

        <Callout tone="info" icon={Info} title="Impacto en Financiamiento">
          Las cuentas AU suman a la edad promedio y al límite total disponible.
          Agregarlas solo para bajar la utilización puede mejorar el puntaje
          personal, pero no cambia por sí solo la elegibilidad para
          financiamiento de negocio. {plan.authorizedUsers.note}
        </Callout>

        <Callout tone="warning" icon={Target} title="Acción Recomendada">
          {plan.authorizedUsers.confirmedCount < AU_MAX
            ? "Opcional: agregar una cuenta AU de límite alto de un banco grande, con buen historial y baja utilización. No es obligatorio."
            : "El perfil ya usa el tope de cuentas AU. Prioriza tarjetas primarias propias."}
        </Callout>
      </Section>

      <Section n={4} tone="success" icon={ShieldCheck} title="Preparación para Financiamiento por Buró">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="py-2 font-medium">Categoría</th>
                {plan.fundingMatrix.map((r) => (
                  <th key={r.bureau} className="py-2 text-center font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: bureauColor(r.bureau) }} aria-hidden />
                      {CREDIT_BUREAU_LABELS[r.bureau]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [`Puntaje >= ${SCORE_MIN}`, (r) => r.scoreOk],
                  ["Sin elementos negativos", (r) => r.noNegatives],
                  [`Utilización <= ${UTIL_MAX}%`, (r) => r.utilOk],
                  ["Edad de Crédito >= 2.5 Años", (r) => r.ageOk],
                  [
                    `<= ${INQUIRY_MAX} Consultas (últimos 6 meses)`,
                    (r) => {
                      const b = plan.bureaus.find((x) => x.bureau === r.bureau);
                      return b?.inquiries == null ? null : b.inquiries <= INQUIRY_MAX;
                    },
                  ],
                  [
                    "Estructura Sólida de Primarias (3+ primarias, una de 5 000+ y otra de 2 000+)",
                    (r) => r.structureOk,
                  ],
                  [
                    "Alto límite de crédito combinado (40 000+ combinado incl. límites AU)",
                    (r) => r.combinedLimitOk,
                  ],
                ] as const satisfies readonly (readonly [
                  string,
                  (r: ClientActionPlan["fundingMatrix"][number]) => boolean | null,
                ])[]
              ).map(([title, get]) => (
                <tr key={title} className="border-t border-border-subtle">
                  <td className="py-2 pr-3 text-ink">{title}</td>
                  {plan.fundingMatrix.map((r) => (
                    <td key={r.bureau} className="py-2 text-center">
                      <Check value={get(r)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className={`rounded-control px-3 py-2 text-[13px] ${
            plan.bureausApproved > 0
              ? "bg-success-soft text-success-ink"
              : "bg-danger-soft text-danger-ink"
          }`}
        >
          {plan.bureausApproved} de 3 burós cumplen todos los criterios verificados.
        </div>
      </Section>

      <Section n={5} tone="warning" icon={Trophy} title="Veredicto">
        <div className="rounded-surface bg-purple-soft px-5 py-6 text-center">
          <p className="flex items-start justify-center gap-2 text-[17px] font-semibold text-ink">
            {plan.qualified ? (
              <BadgeCheck className="mt-0.5 size-5 shrink-0 text-success-ink" aria-hidden />
            ) : (
              <Wrench className="mt-0.5 size-5 shrink-0 text-text-secondary" aria-hidden />
            )}
            {plan.qualified
              ? `El perfil cumple todos los criterios en ${plan.bureausApproved} buró${plan.bureausApproved === 1 ? "" : "s"}. Revisa programas de financiamiento con datos verificados.`
              : "Tu perfil crediticio no califica actualmente para financiamiento. Sigue el plan de acción de la Sección 6 para mejorar tu elegibilidad."}
          </p>
          <p className="mt-2 text-[13px] text-text-secondary">
            Podemos ayudarte a reparar o estructurar tu crédito para que califiques a financiamiento.
          </p>
        </div>
      </Section>

      <Section n={6} tone="success" icon={ListChecks} title="Plan de Acción">
        {plan.negativeAccounts.length > 0 ? (
          <NegativeAccounts accounts={plan.negativeAccounts} />
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {plan.priorities.map((priority, index) => (
            <article
              key={priority.id}
              className="flex flex-col gap-3 rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
                    Prioridad {index + 1}
                  </p>
                  <h3 className="text-[15px] font-semibold text-ink">{priority.title}</h3>
                </div>
                <Chip tone={priority.severity === "CRITICO" ? "danger" : "warning"}>
                  {priority.severity === "CRITICO" ? "CRÍTICO" : "IMPORTANTE"}
                </Chip>
              </div>
              <p className="line-clamp-4 text-[13px] text-text-secondary">
                {priority.summary}
              </p>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {priority.ficoImpact !== ACTION_PLAN_POINT_IMPACT_UNAVAILABLE ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-text-secondary ring-1 ring-border-subtle">
                    <TrendingUp className="size-3" aria-hidden />
                    {priority.ficoImpact}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-text-secondary ring-1 ring-border-subtle">
                  <Clock className="size-3" aria-hidden />
                  {priority.timeline}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHowTo(priority)}
                className="mt-auto inline-flex w-fit items-center gap-1 rounded-control bg-purple-ink px-3 py-1.5 text-[12px] font-semibold text-[light-dark(#ffffff,#1c1c1e)] hover:opacity-90"
              >
                Ver cómo solucionar
                <ChevronRight className="size-3.5" aria-hidden />
              </button>
            </article>
          ))}
        </div>

        {plan.actions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">
              Acciones detectadas en este reporte
            </p>
            {plan.actions.map((action) => (
              <div
                key={action.idempotencyKey}
                className="rounded-control px-3 py-2 text-[13px] ring-1 ring-border-subtle"
              >
                <span className="font-medium text-ink">
                  {ACTION_KIND_LABEL[action.kind]}
                </span>
                <span className="text-text-secondary">
                  {" "}
                  · {ACTION_PRIORITY_LABEL[action.priority]} · {action.summary}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section
        n={7}
        tone="warning"
        icon={Landmark}
        title={`Secuencia de Financiamiento Recomendada${plan.clientState ? ` (${plan.clientState})` : ""}`}
      >
        <div
          className={`rounded-surface px-4 py-4 text-center ${
            plan.qualified ? "bg-success-soft" : "bg-danger-soft"
          }`}
        >
          <p
            className={`text-[14px] font-semibold ${
              plan.qualified ? "text-success-ink" : "text-danger-ink"
            }`}
          >
            {plan.qualified ? "Financiamiento en revisión" : "Financiamiento No Disponible"}
          </p>
          <p className="mt-1 text-[13px] text-text-secondary">
            {plan.qualified
              ? "Confirma ingresos, tiempo del negocio y programas disponibles antes de aplicar."
              : "Tu perfil crediticio no califica actualmente para financiamiento. Sigue el plan de acción de la Sección 6 para mejorar tu elegibilidad."}
          </p>
        </div>
      </Section>

      <div className="grid gap-3 sm:grid-cols-3">
        <BigStat
          tone="purple"
          icon={TrendingUp}
          value={plan.avgScore?.toString() ?? "Sin dato"}
          label="Score promedio informativo"
        />
        <BigStat
          tone="success"
          icon={CreditCard}
          value={utilText(plan.revolving.utilizationBps)}
          label="Utilización total (saldo / límite)"
        />
        <BigStat
          tone="warning"
          icon={ShieldCheck}
          value={fundingLabel}
          label="Potencial de Financiamiento"
        />
      </div>

      <p className="text-center text-[11px] leading-relaxed text-text-secondary">
        Análisis educativo basado en el reporte importado. No garantiza la
        eliminación de cuentas, cambios de puntaje ni aprobaciones de
        financiamiento. Los datos exactos y verificables pueden permanecer
        en el reporte hasta 7 años (10 en bancarrota Capítulo 7).
      </p>

      <Modal
        open={howTo != null}
        onClose={() => setHowTo(null)}
        title={howTo?.title ?? ""}
      >
        {howTo ? <HowToBody priority={howTo} /> : null}
      </Modal>
    </div>
  );
}

function dedupeCards(cards: ClientActionPlan["revolving"]["cards"]) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = `${card.creditorName.toLowerCase()}|${card.limit}|${card.balance}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function Section({
  n,
  tone,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  n: number;
  tone: Tone;
  icon: typeof Info;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <section className="overflow-hidden rounded-surface bg-surface-panel ring-1 ring-border-subtle/60">
      <header className={`flex items-center gap-3 px-4 py-3 ${t.soft}`}>
        <span className="grid size-7 place-items-center rounded-control bg-surface-panel text-[13px] font-semibold text-ink ring-1 ring-border-subtle">
          {n}
        </span>
        <Icon className={`size-4 shrink-0 ${t.ink}`} aria-hidden />
        <h2 className={`text-[16px] font-semibold ${t.ink}`}>{title}</h2>
      </header>
      <div className="space-y-4 p-4">
        {subtitle ? (
          <p className="-mt-1 text-[12px] text-text-secondary">{subtitle}</p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium ${t.soft} ${t.ink}`}
    >
      {children}
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  valueTone,
}: {
  label: string;
  value: string;
  hint?: string;
  valueTone?: Tone;
}) {
  return (
    <div className="rounded-control px-3 py-2.5 ring-1 ring-border-subtle">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p
        className={`mt-0.5 text-[20px] font-semibold tabular-nums ${
          valueTone ? TONE[valueTone].ink : "text-ink"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="text-[11px] text-text-secondary">{hint}</p> : null}
    </div>
  );
}

function Callout({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: Tone;
  icon?: typeof Info;
  title: string;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className={`flex gap-3 rounded-control px-4 py-3 ${t.soft}`}>
      {Icon ? <Icon className={`mt-0.5 size-4 shrink-0 ${t.ink}`} aria-hidden /> : null}
      <div className="min-w-0 text-[13px] text-text-secondary">
        <p className={`mb-1 font-semibold ${t.ink}`}>{title}</p>
        {children}
      </div>
    </div>
  );
}

function RatingList({
  rows,
}: {
  rows: { label: string; value: string; rating: Rating }[];
}) {
  return (
    <dl className="mt-3 space-y-1 border-t border-border-subtle pt-2 text-[12px]">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-2">
          <dt className="text-text-secondary">{row.label}:</dt>
          <dd className={`font-medium ${TONE[row.rating.tone].ink}`}>
            {row.value} · {row.rating.label}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BarChart({
  bars,
  min,
  max,
  threshold,
}: {
  bars: { label: string; value: number | null; display: string; color: string }[];
  min: number;
  max: number;
  /** Línea de referencia (p. ej. 720 o 10%). */
  threshold?: number;
}) {
  const mounted = useMounted();
  const span = Math.max(max - min, 1);
  const thresholdPct =
    threshold == null ? null : Math.min(Math.max((threshold - min) / span, 0), 1) * 100;
  return (
    <div className="relative">
      <div className="relative flex h-44 items-end justify-around gap-3 border-b border-border-subtle px-2 pt-5">
        {thresholdPct != null ? (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-text-secondary/40"
            style={{ bottom: `calc(${thresholdPct}% * 0.82)` }}
            aria-hidden
          />
        ) : null}
        {bars.map((bar, i) => {
          const ratio =
            bar.value == null ? 0 : Math.min(Math.max((bar.value - min) / span, 0.03), 1);
          return (
            <div
              key={bar.label}
              className="group flex h-full w-full max-w-20 flex-col items-center justify-end gap-1"
            >
              <span className="text-[13px] font-semibold tabular-nums text-ink transition-transform duration-200 group-hover:-translate-y-0.5">
                {bar.display}
              </span>
              <div
                className="w-full origin-bottom rounded-t-[6px] motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:brightness-110"
                style={{
                  height: `${ratio * 82}%`,
                  background: bar.color,
                  transform: mounted ? "scaleY(1)" : "scaleY(0)",
                  transitionDelay: `${i * 90}ms`,
                }}
                title={`${bar.label}: ${bar.display}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-around gap-3 px-2 pt-1.5">
        {bars.map((bar) => (
          <span
            key={bar.label}
            className="inline-flex w-full max-w-20 items-center justify-center gap-1.5 text-[11px] text-text-secondary"
          >
            <span className="size-2 rounded-full" style={{ background: bar.color }} aria-hidden />
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Donut({
  slices,
  center,
  active,
  onActive,
}: {
  slices: { value: number; color: string; label: string }[];
  center: string;
  active: number | null;
  onActive: (index: number | null) => void;
}) {
  const mounted = useMounted();
  const total = slices.reduce((a, s) => a + s.value, 0);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const activeSlice = active == null ? null : slices[active];
  return (
    <div className="relative mx-auto size-[200px]">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90">
        <circle cx="100" cy="100" r={radius} fill="none" strokeWidth="30" className="stroke-nav-hover" />
        {total > 0
          ? slices.map((slice, i) => {
              const length = (slice.value / total) * circumference;
              const shown = mounted ? length : 0;
              const el = (
                <circle
                  key={i}
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={active === i ? 38 : 30}
                  strokeDasharray={`${shown} ${circumference - shown}`}
                  strokeDashoffset={-offset}
                  opacity={active == null || active === i ? 1 : 0.35}
                  className="cursor-pointer motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]"
                  onMouseEnter={() => onActive(i)}
                  onMouseLeave={() => onActive(null)}
                >
                  <title>{slice.label}</title>
                </circle>
              );
              offset += length;
              return el;
            })
          : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div className="max-w-[110px]">
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            {activeSlice ? activeSlice.label : "Límite total"}
          </p>
          <p className="text-[19px] font-bold tabular-nums text-ink">{center}</p>
        </div>
      </div>
    </div>
  );
}

function Check({ value }: { value: boolean | null }) {
  if (value == null) {
    return <span className="text-[11px] text-text-secondary">Sin dato</span>;
  }
  return value ? (
    <CheckCircle2 className="mx-auto size-4 text-success-ink" aria-label="Cumple" />
  ) : (
    <XCircle className="mx-auto size-4 text-danger-ink" aria-label="No cumple" />
  );
}

function BigStat({
  tone,
  icon: Icon,
  value,
  label,
}: {
  tone: Tone;
  icon: typeof Info;
  value: string;
  label: string;
}) {
  const t = TONE[tone];
  return (
    <div className={`rounded-surface px-4 py-6 text-center ${t.soft}`}>
      <Icon className={`mx-auto size-5 ${t.ink}`} aria-hidden />
      <p className={`mt-2 text-[28px] font-bold leading-tight ${t.ink}`}>{value}</p>
      <p className="mt-1 text-[12px] text-text-secondary">{label}</p>
    </div>
  );
}

function HowToBody({ priority }: { priority: ActionPlanPriority }) {
  return (
    <div className="space-y-4 text-[13px] text-text-secondary">
      <HowToBlock title="Por qué importa">
        <p>{priority.why}</p>
      </HowToBlock>
      <HowToBlock title="Pasos">
        <ol className="list-decimal space-y-1 pl-5">
          {priority.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </HowToBlock>
      <HowToBlock title="Errores comunes">
        <ul className="list-disc space-y-1 pl-5">
          {priority.commonMistakes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </HowToBlock>
      <HowToBlock title="Orden profesional">
        <ol className="list-decimal space-y-1 pl-5">
          {priority.professionalOrder.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </HowToBlock>
      <HowToBlock title="Qué esperar">
        <p>{priority.expectations}</p>
      </HowToBlock>
    </div>
  );
}

function HowToBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink">
        {title}
      </p>
      {children}
    </div>
  );
}

function AiSummary({ reportId }: { reportId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await summarizeCreditAnalysisAction(reportId);
      if (result.ok) setSummary(result.data.summary);
      else setError(result.error);
    });
  }

  return (
    <section className="rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-purple-ink" aria-hidden />
          <h2 className="text-[15px] font-semibold text-ink">Resumen con IA</h2>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="inline-flex items-center rounded-control px-3 py-1.5 text-[12px] font-semibold text-purple-ink ring-1 ring-border-subtle transition-transform hover:bg-nav-hover active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Generando…" : summary ? "Volver a generar" : "Explicar este reporte"}
        </button>
      </div>
      {pending && !summary ? (
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-3 w-4/5 animate-pulse rounded bg-nav-hover" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-nav-hover" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-nav-hover" />
        </div>
      ) : null}
      {summary ? (
        <div className="mt-3">
          <MarkdownText text={summary} />
          <p className="mt-2 text-[11px] text-text-secondary">
            Generado con IA a partir de las métricas del reporte. Revísalo antes de compartirlo.
          </p>
        </div>
      ) : !pending ? (
        <p className="mt-2 text-[13px] text-text-secondary">
          Un párrafo en lenguaje claro para explicarle al cliente su situación y qué corregir primero.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-[12px] text-danger-ink">{error}</p> : null}
    </section>
  );
}

function NegativeAccounts({
  accounts,
}: {
  accounts: ClientActionPlan["negativeAccounts"];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? accounts : accounts.slice(0, 6);
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-ink">
        Cuentas negativas a revisar ({accounts.length})
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((account) => (
          <div
            key={account.id}
            className="rounded-control px-3 py-2 text-[12px] ring-1 ring-border-subtle"
            style={{ borderLeft: `3px solid ${bureauColor(account.bureau)}` }}
          >
            <p className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-ink">{account.creditorName}</span>
              <span className="shrink-0 text-text-secondary">
                {CREDIT_BUREAU_LABELS[account.bureau] ?? account.bureau}
              </span>
            </p>
            <p className="mt-0.5 text-text-secondary">
              {account.negativeType ? (CREDIT_NEGATIVE_TYPE_LABELS[account.negativeType] ?? account.negativeType) : "Negativo"}
              {account.accountStatus ? ` · ${account.accountStatus}` : ""}
            </p>
            {account.old ? (
              <p className="mt-0.5 text-[11px] font-medium text-success-ink">
                Atraso de más de 3 años: no bloquea fondeo
              </p>
            ) : null}
            <p className="mt-0.5 text-text-secondary">
              {account.dateOpened ? `Abierta ${formatDate(account.dateOpened, "UTC")}` : "Apertura sin dato"}
              {account.dateReported ? ` · reportada ${formatDate(account.dateReported, "UTC")}` : ""}
            </p>
          </div>
        ))}
      </div>
      {accounts.length > 6 ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-[12px] font-medium text-action-primary"
        >
          {showAll ? "Ver menos" : `Ver las ${accounts.length}`}
        </button>
      ) : null}
    </div>
  );
}
