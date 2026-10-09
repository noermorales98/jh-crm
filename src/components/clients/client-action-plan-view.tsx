"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientActionPlan } from "@/src/server/credit-reports/action-plan";
import { AgencyModal } from "@/src/components/agency/agency-modal";
import { Button } from "@/src/components/ui";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import { formatDate, formatMoney } from "@/src/lib/format";

export function ClientActionPlanView({
  plan,
  organizationName,
}: {
  plan: ClientActionPlan;
  organizationName: string;
}) {
  const [howtoId, setHowtoId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const activeHowTo = plan.priorities.find((p) => p.id === howtoId) ?? null;

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
          <span
            className={`rounded-full px-3 py-1 text-[12px] font-medium ${
              plan.qualified
                ? "bg-success-soft text-success-ink"
                : "bg-danger-soft text-danger-ink"
            }`}
          >
            {plan.qualified
              ? "Señales heurísticas a revisar"
              : "Heurística: preparar perfil primero"}
          </span>
          <span className="rounded-full bg-warning-soft px-3 py-1 text-[12px] font-medium text-warning-ink">
            Estimado de fondeo:{" "}
            {plan.qualified ? "Revisar secuencia" : "Preparar perfil"}
          </span>
          <span className="rounded-full bg-action-primary/10 px-3 py-1 text-[12px] font-medium text-action-primary">
            {plan.bureausApproved} de 3 burós cumplen la heurística interna
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
                {b.utilization != null
                  ? ` · Util. ${Math.round(b.utilization)}%`
                  : ""}
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
                    `${CREDIT_BUREAU_LABELS[b.bureau]} ${
                      b.utilization != null
                        ? `${Math.round(b.utilization)}%`
                        : "—"
                    } (${b.utilLabel})`,
                )
                .join(" · ")}
            </li>
            <li>
              Hard inquiries (≤3):{" "}
              {plan.bureaus
                .map(
                  (b) =>
                    `${CREDIT_BUREAU_LABELS[b.bureau]} ${b.inquiries ?? "—"}`,
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
          <Kpi label="Tarjetas abiertas" value={String(plan.revolving.openCards)} />
          <Kpi
            label="Límite total"
            value={formatMoney(plan.revolving.totalLimit, "USD")}
          />
          <Kpi label="≥ $2K" value={`${plan.revolving.cardsGe2k}`} />
          <Kpi
            label="Utilización"
            value={
              plan.revolving.utilPct != null
                ? `${plan.revolving.utilPct.toFixed(1)}%`
                : "—"
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
                      {c.limit != null ? formatMoney(c.limit, "USD") : "—"}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {c.balance != null ? formatMoney(c.balance, "USD") : "—"}
                    </td>
                    <td className="py-1.5 tabular-nums">
                      {c.utilization != null
                        ? `${c.utilization.toFixed(1)}%`
                        : "—"}
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
          3 · Estrategia de Usuario Autorizado (AU)
        </h2>
        <p className="text-[13px] text-text-secondary">
          Cuentas AU activas detectadas: {plan.revolving.auCards} (máx. 3
          recomendado). Las AU ayudan a edad y límite combinado; no sustituyen
          bajar utilización en primarias.
        </p>
        <p className="text-[13px] text-ink">
          Acción recomendada: opcional agregar AU de al menos $15,000 en banco
          grande si el perfil lo permite.
        </p>
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
                  ["≤ 3 consultas", "inquiriesOk"],
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
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-text-secondary">
          {plan.bureausApproved} de 3 burós cumplen todos los criterios
          verificados.
        </p>
      </section>

      <section className="rounded-surface bg-nav-hover/40 px-4 py-4">
        <h2 className="text-[16px] font-semibold text-ink">5 · Veredicto</h2>
        <p className="mt-2 text-[14px] text-text-secondary">{plan.verdict}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-ink">6 · Plan de Acción</h2>
        {plan.priorities.map((p, index) => (
          <article
            key={p.id}
            className="rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle/60"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase text-text-secondary">
                Prioridad {index + 1}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  p.severity === "CRITICO"
                    ? "bg-danger-soft text-danger-ink"
                    : "bg-warning-soft text-warning-ink"
                }`}
              >
                {p.severity === "CRITICO" ? "Crítico" : "Importante"}
              </span>
            </div>
            <h3 className="mt-1 text-[15px] font-semibold text-ink">
              {p.title}
            </h3>
            <p className="mt-1 text-[13px] text-text-secondary">{p.summary}</p>
            <p className="mt-2 text-[12px] text-text-secondary">
              {p.ficoImpact} · {p.timeline}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => setHowtoId(p.id)}
            >
              Ver cómo solucionar
            </Button>
          </article>
        ))}
      </section>

      <section className="rounded-surface bg-surface-panel p-4 ring-1 ring-border-subtle/60">
        <h2 className="text-[16px] font-semibold text-ink">
          7 · Secuencia de Financiamiento
        </h2>
        <p className="mt-2 text-[14px] font-semibold text-ink">
          {plan.qualified
            ? "Estimado: secuencia a revisar (heurística)"
            : "Estimado: preparar perfil (heurística)"}
        </p>
        <p className="mt-1 text-[13px] text-text-secondary">{plan.verdict}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Kpi label="Score promedio" value={plan.avgScore?.toString() ?? "—"} />
          <Kpi
            label="Util. promedio"
            value={
              plan.avgUtilization != null ? `${plan.avgUtilization}%` : "—"
            }
          />
          <Kpi
            label="Fondeo (est.)"
            value={plan.qualified ? "Revisar" : "Preparar"}
          />
        </div>
      </section>

      <AgencyModal
        open={activeHowTo != null}
        onClose={() => setHowtoId(null)}
        title={activeHowTo?.title ?? ""}
        size="lg"
      >
        {activeHowTo ? (
          <div className="space-y-4 text-[13px] text-text-secondary">
            <div>
              <h3 className="text-[12px] font-semibold uppercase text-ink">
                Por qué importa
              </h3>
              <p className="mt-1">{activeHowTo.why}</p>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold uppercase text-ink">
                Pasos
              </h3>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                {activeHowTo.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold uppercase text-ink">
                Errores comunes
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {activeHowTo.commonMistakes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold uppercase text-ink">
                Orden profesional
              </h3>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                {activeHowTo.professionalOrder.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold uppercase text-ink">
                Expectativas realistas
              </h3>
              <p className="mt-1">{activeHowTo.expectations}</p>
            </div>
          </div>
        ) : null}
      </AgencyModal>
    </div>
  );
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
