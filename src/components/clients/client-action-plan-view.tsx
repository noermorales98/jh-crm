"use client";

import { useState, type ReactNode } from "react";
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
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
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
  if (util <= UTIL_MAX) return { label: "Excelente", tone: "success" };
  if (util <= 30) return { label: "Bueno", tone: "warning" };
  return { label: "Necesita mejorar", tone: "danger" };
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

  const label = (b: ClientActionPlan["bureaus"][number]) =>
    CREDIT_BUREAU_LABELS[b.bureau] ?? b.bureau;
  const scoreFails = plan.bureaus.filter((b) => !b.scoreOk).map(label);
  const utilFails = plan.bureaus.filter((b) => !b.utilOk).map(label);
  const inquiryFails = plan.bureaus
    .filter((b) => b.inquiries != null && b.inquiries > INQUIRY_MAX)
    .map(label);
  const ageFails = plan.bureaus
    .filter((b) => b.avgAgeMonths == null || b.avgAgeMonths < AGE_IDEAL_MONTHS)
    .map(label);
  const negativeBureaus = plan.bureaus.filter((b) => b.negatives > 0).map(label);

  const cards = dedupeCards(plan.revolving.cards);
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
                display: b.score?.toString() ?? "—",
              }))}
              min={550}
              max={850}
              color="bg-[#3b82f6]"
            />
            <RatingList
              rows={plan.bureaus.map((b) => ({
                label: label(b),
                value: b.score?.toString() ?? "—",
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
              }))}
              min={0}
              max={Math.max(
                25,
                ...plan.bureaus.map((b) => Math.ceil(utilPercent(b) ?? 0)),
              )}
              color="bg-[#22c55e]"
            />
            <RatingList
              rows={plan.bureaus.map((b) => ({
                label: label(b),
                value: b.utilizationText,
                rating: rateUtil(b.utilization),
              }))}
            />
            <p className="mt-2 text-[11px] text-text-secondary">
              {utilFails.length > 0
                ? `Uno o más burós superan el umbral de ${UTIL_MAX}%`
                : `Los 3 burós están dentro del ${UTIL_MAX}%`}
            </p>
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
              Puntaje de crédito ({plan.bureaus.map((b) => `${label(b)} ${b.score ?? "—"}`).join(", ")}):{" "}
              {scoreFails.length > 0 ? (
                <>
                  <strong className="text-ink">Necesita mejorar</strong> —{" "}
                  {bureauList(scoreFails)} no alcanza el mínimo de {SCORE_MIN} puntos.
                </>
              ) : (
                <>
                  <strong className="text-ink">Excelente</strong> — los 3 burós
                  alcanzan {SCORE_MIN}+.
                </>
              )}
            </li>
            <li>
              Utilización de crédito ({plan.bureaus.map((b) => `${label(b)} ${b.utilizationText}`).join(", ")}):{" "}
              {utilFails.length > 0 ? (
                <>
                  <strong className="text-ink">Necesita mejorar</strong> —{" "}
                  {bureauList(utilFails)} supera el {UTIL_MAX}%.
                </>
              ) : (
                <>
                  <strong className="text-ink">Excelente</strong> — los 3 burós
                  quedan en {UTIL_MAX}% o menos.
                </>
              )}
            </li>
            <li>
              Hard inquiries ({plan.bureaus.map((b) => `${label(b)} ${b.inquiries ?? "—"}`).join(", ")}):{" "}
              {inquiryFails.length > 0 ? (
                <>
                  <strong className="text-ink">Necesita mejorar</strong> —{" "}
                  {bureauList(inquiryFails)} tiene más de {INQUIRY_MAX} consultas.
                </>
              ) : (
                <>
                  <strong className="text-ink">Bueno</strong> — los 3 burós
                  tienen {INQUIRY_MAX} consultas o menos.
                </>
              )}
            </li>
            <li>
              Edad promedio de crédito ({plan.bureaus.map((b) => `${label(b)} ${years(b.avgAgeMonths)}`).join(", ")}):{" "}
              {ageFails.length > 0 ? (
                <>
                  <strong className="text-ink">Necesita mejorar</strong> —{" "}
                  {bureauList(ageFails)} no llega a los 3+ años ideales.
                </>
              ) : (
                <>
                  <strong className="text-ink">Excelente</strong> — alcanza
                  los 3+ años ideales en los 3 burós.
                </>
              )}
            </li>
            <li>
              Historial de pagos:{" "}
              {negativeBureaus.length > 0 ? (
                <>
                  <strong className="text-ink">Necesita mejorar</strong> —{" "}
                  {bureauList(negativeBureaus)} reporta negativos (
                  {plan.negativeCount} de {plan.totalItems} cuentas).
                </>
              ) : (
                <>
                  <strong className="text-ink">Bueno</strong> — sin negativos
                  reportados.
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
            value={plan.revolving.openCards?.toString() ?? "—"}
            hint={`${plan.revolving.primaryCards ?? "—"} Principal, ${plan.revolving.auCards} AU`}
          />
          <Kpi
            label="Límite total"
            value={money(plan.revolving.totalLimit, plan.revolving.currency)}
            hint={`${money(plan.revolving.totalUsed, plan.revolving.currency)} usado`}
          />
          <Kpi
            label="Tarjetas ≥ 2 000"
            value={String(plan.revolving.cardsGe2k)}
            hint={`${plan.revolving.cardsGe2k} de ${plan.revolving.openCards ?? "—"}`}
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
              }))}
              center={money(plan.revolving.totalLimit, plan.revolving.currency)}
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
                    <tr key={`${c.creditorName}-${i}`} className="border-t border-border-subtle">
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
                      <td className="py-2 text-right tabular-nums text-text-secondary">
                        {c.openStatusUnknown ? "—" : utilText(c.utilizationBps)}
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
              Tarjetas abiertas: {plan.revolving.openCards ?? "—"} en total,{" "}
              {plan.revolving.primaryCards ?? "—"} primarias y{" "}
              {plan.revolving.auCards} usuarios autorizados.
            </li>
            <li>Límite total combinado: {money(plan.revolving.totalLimit, plan.revolving.currency)}.</li>
            <li>
              Tarjetas con límite ≥ 2 000: {plan.revolving.cardsGe2k} de{" "}
              {plan.revolving.openCards ?? "—"}.
            </li>
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
            value={plan.revolving.primaryCards?.toString() ?? "—"}
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
                    {CREDIT_BUREAU_LABELS[r.bureau]}
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
                    `<= ${INQUIRY_MAX} Consultas`,
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
                className="mt-auto inline-flex w-fit items-center gap-1 rounded-control bg-purple-ink px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
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
          value={plan.avgScore?.toString() ?? "—"}
          label="Score promedio informativo"
        />
        <BigStat
          tone="success"
          icon={CreditCard}
          value={utilText(
            averageBps(plan.bureaus.map((b) => b.utilizationBps)),
          )}
          label="Utilización Promedio"
        />
        <BigStat
          tone="warning"
          icon={ShieldCheck}
          value={fundingLabel}
          label="Potencial de Financiamiento"
        />
      </div>

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

function averageBps(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  if (known.length === 0) return null;
  return Math.round(known.reduce((a, b) => a + b, 0) / known.length);
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
            {row.value} – {row.rating.label}
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
  color,
}: {
  bars: { label: string; value: number | null; display: string }[];
  min: number;
  max: number;
  color: string;
}) {
  const span = Math.max(max - min, 1);
  return (
    <div className="flex h-40 items-end justify-around gap-3 border-b border-border-subtle px-2">
      {bars.map((bar) => {
        const height =
          bar.value == null
            ? 0
            : Math.min(Math.max((bar.value - min) / span, 0.03), 1) * 100;
        return (
          <div key={bar.label} className="flex h-full w-full max-w-20 flex-col items-center justify-end gap-1">
            <span className="text-[12px] font-semibold tabular-nums text-ink">
              {bar.display}
            </span>
            <div
              className={`w-full rounded-t-[4px] ${color}`}
              style={{ height: `${height}%` }}
            />
            <span className="pb-1 text-[11px] text-text-secondary">{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Donut({
  slices,
  center,
}: {
  slices: { value: number; color: string }[];
  center: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="relative mx-auto size-[200px]">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90">
        <circle cx="100" cy="100" r={radius} fill="none" strokeWidth="34" className="stroke-nav-hover" />
        {total > 0
          ? slices.map((slice, i) => {
              const length = (slice.value / total) * circumference;
              const el = (
                <circle
                  key={i}
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="34"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return el;
            })
          : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            Límite total
          </p>
          <p className="text-[20px] font-bold tabular-nums text-ink">{center}</p>
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
