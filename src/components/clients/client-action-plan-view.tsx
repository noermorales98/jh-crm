"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientActionPlan } from "@/src/server/credit-reports/action-plan";
import { Button } from "@/src/components/ui";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import { ACTION_KIND_LABEL, ACTION_PRIORITY_LABEL } from "@/src/lib/credit/actions";
import { formatDate } from "@/src/lib/format";
import { metricText, presentAmount, presentUtilization, type MetricStatus } from "@/src/lib/credit/metrics-view";

export function ClientActionPlanView({
  plan,
  organizationName,
}: {
  plan: ClientActionPlan;
  organizationName: string;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <Link
        href={`/crm/clientes/${plan.clientId}`}
        className="inline-flex text-[13px] font-medium text-action-primary"
      >
        ← Volver a {plan.clientName}
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">
              Análisis de Crédito y Plan de Acción
            </h1>
            <p className="mt-1 text-[13px] text-text-secondary">
              {organizationName}
            </p>
            <p className="mt-1 text-[14px] text-ink">
              Analizando a: <strong>{plan.clientName}</strong>
            </p>
            <p className="mt-1 text-[12px] text-text-secondary">
              Reporte del {formatDate(plan.reportDate)}
            </p>
          </div>
          <a
            href={`/api/clients/${plan.clientId}/action-plan/pdf?reportId=${plan.reportId}`}
            className="inline-flex items-center rounded-control bg-action-primary px-3 py-2 text-sm font-medium text-action-primary-foreground transition-colors hover:opacity-90"
          >
            Descargar PDF
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-nav-hover px-3 py-1 text-[12px] font-medium text-text-secondary">
            Fondeo: requiere programa y datos verificados
          </span>
        </div>
      </header>

      <section className="space-y-4 rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle/60">
        <h2 className="text-[16px] font-semibold text-ink">
          1 · Desglose por Buró
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {plan.bureaus.map((b) => (
            <div
              key={b.bureau}
              className="rounded-control bg-surface-app px-3 py-3"
            >
              <p className="text-[11px] font-medium uppercase text-text-secondary">
                {CREDIT_BUREAU_LABELS[b.bureau]}
              </p>
              <p className="mt-1 text-[28px] font-semibold tabular-nums text-ink">
                {b.score ?? "—"}
              </p>
              <p className="text-[12px] text-text-secondary">
                {b.scoreLabel}
                {b.score != null ? " · modelo desconocido" : ""}
                {" · Util. "}
                {metricText(presentUtilization({
                  basisPoints: b.utilizationBps,
                  status: metricStatus(b.utilizationStatus),
                }))}
              </p>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setDetailOpen((v) => !v)}
        >
          {detailOpen ? "Ocultar detalle completo" : "Ver detalle completo"}
        </Button>
        {detailOpen ? (
          <ul className="list-disc space-y-2 pl-5 text-[13px] text-text-secondary">
            <li>
              Puntaje (≥{720}):{" "}
              {plan.bureaus
                .map(
                  (b) =>
                    `${CREDIT_BUREAU_LABELS[b.bureau]} ${b.score ?? "—"} (${b.scoreLabel})`,
                )
                .join(" · ")}
            </li>
            <li>
              Utilización (≤10%):{" "}
              {plan.bureaus
                .map(
                  (b) =>
                    `${CREDIT_BUREAU_LABELS[b.bureau]} ${metricText(presentUtilization({
                      basisPoints: b.utilizationBps,
                      status: metricStatus(b.utilizationStatus),
                    }))} (${b.utilLabel})`,
                )
                .join(" · ")}
            </li>
            <li>
              Consultas (contador del reporte):{" "}
              {plan.fundingMatrix
                .map(
                  (r) =>
                    `${CREDIT_BUREAU_LABELS[r.bureau]} ${r.inquiryDisplay}`,
                )
                .join(" · ")}
            </li>
            <li>
              Negativos en reporte: {plan.negativeCount} de {plan.totalItems}{" "}
              cuentas.
            </li>
          </ul>
        ) : null}
      </section>

      <section className="space-y-3 rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle/60">
        <h2 className="text-[16px] font-semibold text-ink">
          2 · Estructura de Crédito Rotativo
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Tarjetas abiertas" value={plan.revolving.openCards == null ? "—" : String(plan.revolving.openCards)} />
          <Kpi
            label="Límite individual"
            value={metricText(presentAmount({
              amount: plan.revolving.totalLimit,
              currency: plan.revolving.currency,
              status: plan.revolving.totalLimit == null ? "UNKNOWN" : "KNOWN",
            }))}
          />
          <Kpi label="≥ $2K" value={`${plan.revolving.cardsGe2k}`} />
          <Kpi
            label="Utilización revolving"
            value={
              plan.revolving.aggregateStatus === "KNOWN"
                ? metricText(presentUtilization({
                    basisPoints: plan.revolving.utilizationBps,
                    status: "KNOWN",
                  }))
                : plan.revolving.coverageLabel
            }
          />
        </div>
        {plan.revolving.cards.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-text-secondary">
                <tr>
                  <th className="py-1.5 font-medium">Emisor</th>
                  <th className="py-1.5 font-medium">Límite</th>
                  <th className="py-1.5 font-medium">Usado</th>
                  <th className="py-1.5 font-medium">Util</th>
                </tr>
              </thead>
              <tbody>
                {plan.revolving.cards.map((c, i) => (
                  <tr key={`${c.creditorName}-${i}`} className="border-t border-border-subtle">
                    <td className="py-1.5 text-ink">{c.creditorName}</td>
                    <td className="py-1.5 tabular-nums">
                      {metricText(presentAmount({
                        amount: c.limit,
                        currency: c.currency,
                        status: c.limit == null ? "UNKNOWN" : "KNOWN",
                      }))}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {metricText(presentAmount({
                        amount: c.balance,
                        currency: c.currency,
                        status: c.balance == null ? "UNKNOWN" : "KNOWN",
                      }))}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {metricText(presentUtilization({
                        basisPoints: c.utilizationBps,
                        status: c.utilizationBps == null ? "UNKNOWN" : "KNOWN",
                      }))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">
            Sin estructura revolving parseada en este reporte.
          </p>
        )}
      </section>

      <section className="space-y-2 rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle/60">
        <h2 className="text-[16px] font-semibold text-ink">
          3 · Usuarios autorizados
        </h2>
        <p className="text-[13px] text-text-secondary">
          {plan.authorizedUsers.confirmedCount} cuenta
          {plan.authorizedUsers.confirmedCount === 1 ? "" : "s"} confirmada
          {plan.authorizedUsers.confirmedCount === 1 ? "" : "s"}.{" "}
          {plan.authorizedUsers.unresolvedCount} sin resolver.{" "}
          {plan.authorizedUsers.conflictCount} con responsabilidad distinta entre
          burós. {plan.authorizedUsers.note}
        </p>
        {plan.authorizedUsers.accounts.length > 0 ? (
          <ul className="space-y-2 text-[13px] text-text-secondary">
            {plan.authorizedUsers.accounts.map((account) => (
              <li key={`${account.creditorName}-${account.sourceReportDate}`}>
                {account.creditorName} · {account.bureaus.join(", ")} ·{" "}
                {account.ageMonths == null ? "edad sin dato" : `${account.ageMonths} meses`}{" "}
                · saldo {account.balance ?? "—"} · límite {account.limit ?? "—"} ·{" "}
                {account.utilization == null ? "utilización sin dato" : `${account.utilization}%`}{" "}
                · {account.accountStatus ?? "estado sin dato"}
                {account.reportedNegative ? " · negativo reportado" : ""} · fuente{" "}
                {account.sourceReportDate}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3 rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle/60">
        <h2 className="text-[16px] font-semibold text-ink">
          4 · Preparación para Financiamiento por Buró
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-text-secondary">
              <tr>
                <th className="py-1">Criterio</th>
                {plan.fundingMatrix.map((r) => (
                  <th key={r.bureau} className="py-1">
                    {CREDIT_BUREAU_LABELS[r.bureau].slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Puntaje ≥ 720", "scoreOk"],
                  ["Sin negativos", "noNegatives"],
                  ["Utilización ≤ 10%", "utilOk"],
                  ["Edad ≥ 2.5 años", "ageOk"],
                  ["Estructura sólida", "structureOk"],
                  ["Límite combinado alto", "combinedLimitOk"],
                ] as const
              ).map(([label, key]) => (
                <tr key={key} className="border-t border-border-subtle">
                  <td className="py-1.5 text-ink">{label}</td>
                  {plan.fundingMatrix.map((r) => {
                    const v = r[key];
                    const cell =
                      v === null
                        ? "Sin dato"
                        : v
                          ? "✓"
                          : "—";
                    return (
                      <td
                        key={r.bureau}
                        className="py-1.5 tabular-nums text-text-secondary"
                      >
                        {cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t border-border-subtle">
                <td className="py-1.5 text-ink">Consultas</td>
                {plan.fundingMatrix.map((r) => (
                  <td
                    key={r.bureau}
                    className="py-1.5 tabular-nums text-text-secondary"
                  >
                    {r.inquiryDisplay}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-text-secondary">
          Referencia interna (720, 10% y $40,000). La edad usa la fecha del
          reporte. Una apertura ausente no cuenta como apta. Las consultas
          muestran el contador del reporte, no un rechazo. Un reporte sin
          cobertura completa no se lee como archivo sin negativos.
        </p>
      </section>

      <section className="rounded-surface bg-nav-hover/40 px-4 py-4">
        <h2 className="text-[16px] font-semibold text-ink">5 · Veredicto</h2>
        <p className="mt-2 text-[14px] text-text-secondary">{plan.verdict}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-ink">6 · Plan de Acción</h2>
        {plan.actions.map((action) => (
          <article
            key={action.idempotencyKey}
            className="rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle/60"
          >
            <span className="text-[11px] font-semibold uppercase text-text-secondary">
              {ACTION_PRIORITY_LABEL[action.priority]}
            </span>
            <h3 className="mt-1 text-[15px] font-semibold text-ink">
              {ACTION_KIND_LABEL[action.kind]}
            </h3>
            <p className="mt-1 text-[13px] text-text-secondary">{action.summary}</p>
            {action.observationIds.length > 0 ? (
              <p className="mt-2 text-[12px] text-text-secondary">
                Observaciones: {action.observationIds.join(", ")}
              </p>
            ) : null}
          </article>
        ))}
      </section>

      <section className="rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle/60">
        <h2 className="text-[16px] font-semibold text-ink">
          7 · Secuencia de Financiamiento
        </h2>
        <p className="mt-2 text-[14px] text-text-secondary">{plan.verdict}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <Kpi label="Score promedio informativo" value={plan.avgScore?.toString() ?? "—"} />
          <Kpi
            label="Utilización revolving"
            value={
              plan.avgUtilization != null ? `${plan.avgUtilization}%` : "—"
            }
          />
        </div>
      </section>
    </div>
  );
}

function metricStatus(status: "KNOWN" | "PARTIAL" | "NOT_APPLICABLE"): MetricStatus {
  if (status === "KNOWN" || status === "PARTIAL") return status;
  return "UNKNOWN";
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-surface-app px-3 py-2">
      <p className="text-[10px] font-medium uppercase text-text-secondary">
        {label}
      </p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">
        {value}
      </p>
    </div>
  );
}
