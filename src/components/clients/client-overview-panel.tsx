import Link from "next/link";
import type { ReactNode } from "react";
import { LineChart } from "lucide-react";
import type { getClientOverview } from "@/src/server/clients/overview";
import { formatDate, formatMoney } from "@/src/lib/format";
import {
  ACTIVITY_TYPE_LABELS,
  ROUND_STATUS_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { StagePill, Pill, ButtonLink } from "@/src/components/ui";
import { ScoreDelta } from "@/src/components/credit-reports/bureau-score-strip";
import { CreateCreditReportButton } from "@/src/components/credit-reports/create-report-button";
import { CreateCaseButton } from "@/src/components/cases/create-case-button";
import { BureauScoreInteractive } from "@/src/components/clients/bureau-score-interactive";
import { CreditScoreChart } from "@/src/components/clients/credit-score-chart";
import { RoundsSummaryStrip } from "@/src/components/clients/rounds-summary-strip";
import { PaymentsSummaryStrip } from "@/src/components/clients/payments-summary-strip";

type Overview = Awaited<ReturnType<typeof getClientOverview>>;

function Metric({
  label,
  children,
  href,
}: {
  label: string;
  children: ReactNode;
  href?: string;
}) {
  const body = (
    <div className="rounded-control border border-border-subtle bg-surface-panel px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <div className="mt-0.5 text-sm font-medium tabular-nums text-ink">{children}</div>
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block transition-colors hover:opacity-90">
      {body}
    </Link>
  );
}

function CreditTimeline({
  scoreHistory,
  rounds,
}: {
  scoreHistory: Overview["credit"] extends null
    ? never
    : NonNullable<Overview["credit"]>["scoreHistory"];
  rounds: Overview["credit"] extends null
    ? never
    : NonNullable<Overview["credit"]>["roundsSummary"];
}) {
  type Ev = { at: Date; kind: string; label: string };
  const events: Ev[] = [];
  for (const h of scoreHistory) {
    events.push({
      at: new Date(h.reportDate),
      kind: "report",
      label: h.label,
    });
  }
  for (const r of rounds) {
    if (r.sentAt) {
      events.push({
        at: r.sentAt,
        kind: "round",
        label: `Ronda #${r.roundNumber} enviada`,
      });
    }
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  const shown = events.slice(-6);
  if (shown.length < 2) return null;

  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-[20rem] items-start gap-0">
        {shown.map((ev, i) => (
          <li
            key={`${ev.kind}-${ev.label}-${i}`}
            className="relative flex flex-1 flex-col items-center px-1 text-center"
          >
            {i < shown.length - 1 ? (
              <span
                className="absolute left-1/2 top-1.5 h-px w-full bg-border-subtle"
                aria-hidden
              />
            ) : null}
            <span
              className={`relative z-[1] size-2.5 rounded-full ${
                ev.kind === "report" ? "bg-action-primary" : "bg-success-ink"
              }`}
            />
            <span className="mt-1 text-[10px] tabular-nums text-text-secondary">
              {formatDate(ev.at)}
            </span>
            <span className="line-clamp-2 text-[10px] text-ink">{ev.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ClientOverviewPanel({
  overview,
  canManageCredit,
  canManageCases,
  canRegisterPayment,
  stages,
  members,
}: {
  overview: Overview;
  canManageCredit: boolean;
  canManageCases: boolean;
  canRegisterPayment?: boolean;
  stages: { id: string; name: string; color: string }[];
  members: { id: string; name: string }[];
}) {
  const { client, activeService, lastActivity, credit, services, nextAction } =
    overview;
  const caseId = activeService?.creditCaseId ?? null;
  const caseHref = caseId ? `/crm/casos/${caseId}` : null;
  const creditHref = caseId ? `/crm/casos/${caseId}/credito` : null;

  const avgDelta = credit?.bureaus
    ? (() => {
        const vals = credit.bureaus
          .map((b) => b.deltaFromInitial)
          .filter((v): v is number => v != null);
        if (vals.length === 0) return null;
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      })()
    : null;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="Etapa">
          {activeService?.stage ? (
            <StagePill
              name={activeService.stage.name}
              color={activeService.stage.color}
            />
          ) : services.length === 0 ? (
            <span className="text-text-secondary">Sin servicio</span>
          ) : (
            "—"
          )}
        </Metric>
        <Metric label="Próxima acción">
          {nextAction?.at ? (
            <span>
              <span className="block text-xs font-normal text-text-secondary">
                {nextAction.label}
              </span>
              <span className="tabular-nums">{formatDate(nextAction.at)}</span>
            </span>
          ) : (
            <span className="text-text-secondary">
              {nextAction?.label ?? "Sin fecha"}
            </span>
          )}
        </Metric>
        <Metric
          label="Última actividad"
          href={`/crm/clientes/${client.id}/actividad`}
        >
          {lastActivity ? (
            <span className="line-clamp-2 text-xs font-normal leading-snug">
              <span className="font-medium">
                {labelFor(ACTIVITY_TYPE_LABELS, lastActivity.type)}
              </span>
              {" · "}
              {lastActivity.description}
            </span>
          ) : (
            <span className="text-text-secondary">Sin actividad</span>
          )}
        </Metric>
      </div>

      {!activeService ? (
        <div className="rounded-control border border-dashed border-border-subtle px-3 py-3">
          <p className="text-sm font-medium text-ink">Sin expediente de crédito</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Crea un caso Credit Repair para ver scores, rondas y progreso aquí.
          </p>
          {canManageCases ? (
            <div className="mt-2">
              <CreateCaseButton
                clientId={client.id}
                stages={stages}
                members={members}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {activeService && credit ? (
        <section className="rounded-surface border border-border-subtle bg-surface-panel p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Crédito
              </h2>
              <Pill tone="slate">{activeService.caseCode}</Pill>
              {avgDelta != null ? (
                <span className="text-xs text-text-secondary">
                  Progreso medio <ScoreDelta value={avgDelta} />
                </span>
              ) : null}
              {credit.outcomeSummary.deleted + credit.outcomeSummary.updated >
              0 ? (
                <span className="text-[11px] text-text-secondary">
                  Resultados: {credit.outcomeSummary.deleted} elim. ·{" "}
                  {credit.outcomeSummary.updated} act.
                </span>
              ) : null}
            </div>
            {creditHref ? (
              <ButtonLink href={creditHref} variant="ghost" size="sm">
                Ver detalle
              </ButtonLink>
            ) : null}
          </div>

          {!credit.canView ? (
            <p className="text-sm text-text-secondary">
              No tienes permiso para ver reportes de crédito.
            </p>
          ) : credit.reportCount === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-dashed border-border-subtle px-3 py-2.5">
              <div className="flex items-start gap-2">
                <LineChart
                  className="mt-0.5 size-4 text-text-secondary"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium text-ink">
                    Sin reporte de crédito
                  </p>
                  <p className="text-xs text-text-secondary">
                    Registra el reporte inicial para ver scores y evolución.
                  </p>
                </div>
              </div>
              {canManageCredit && caseId ? (
                <CreateCreditReportButton caseId={caseId} />
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <BureauScoreInteractive
                bureaus={credit.bureaus}
                scoreHistory={credit.scoreHistory}
              />

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-2">
                  {credit.hasChartData && caseId ? (
                    <CreditScoreChart
                      history={credit.scoreHistory}
                      caseId={caseId}
                      compact
                    />
                  ) : (
                    <p className="rounded-control border border-border-subtle px-3 py-2 text-xs text-text-secondary">
                      Un solo reporte: la gráfica aparecerá con el siguiente
                      update.
                    </p>
                  )}
                  <CreditTimeline
                    scoreHistory={credit.scoreHistory}
                    rounds={credit.roundsSummary}
                  />
                </div>

                <div className="space-y-2">
                  <div className="rounded-control border border-border-subtle px-2.5 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                      Ronda actual
                    </p>
                    {credit.round ? (
                      <div className="mt-1 space-y-1 text-sm">
                        <p className="font-medium text-ink">
                          #{credit.round.roundNumber}{" "}
                          <span className="font-normal text-text-secondary">
                            {labelFor(
                              ROUND_STATUS_LABELS,
                              credit.round.status,
                            )}
                          </span>
                        </p>
                        <p className="text-xs text-text-secondary">
                          Enviada:{" "}
                          <span className="tabular-nums">
                            {credit.round.sentAt
                              ? formatDate(credit.round.sentAt)
                              : "—"}
                          </span>
                          {" · "}
                          Revisión:{" "}
                          <span className="tabular-nums">
                            {credit.round.expectedReviewAt
                              ? formatDate(credit.round.expectedReviewAt)
                              : "—"}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-text-secondary">
                        Sin rondas
                      </p>
                    )}
                  </div>

                  {caseId ? (
                    <RoundsSummaryStrip
                      rounds={credit.roundsSummary}
                      currentRoundId={credit.currentRoundId}
                      caseId={caseId}
                      roundsTotal={credit.roundsTotal}
                    />
                  ) : null}

                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-control bg-surface-app px-1 py-1.5">
                      <p className="text-[10px] uppercase text-text-secondary">
                        Activos
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {credit.itemsSummary.active}
                      </p>
                    </div>
                    <div className="rounded-control bg-surface-app px-1 py-1.5">
                      <p className="text-[10px] uppercase text-text-secondary">
                        Resueltos
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {credit.itemsSummary.resolved}
                      </p>
                    </div>
                    <div className="rounded-control bg-surface-app px-1 py-1.5">
                      <p className="text-[10px] uppercase text-text-secondary">
                        Pend.
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {credit.itemsSummary.pending}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="Rondas"
          href={caseHref ? `${caseHref}/rondas` : undefined}
        >
          <span className="tabular-nums">{credit?.roundsTotal ?? 0}</span>
        </Metric>
        <Metric
          label="Documentos"
          href={`/crm/clientes/${client.id}/documentos`}
        >
          <span className="tabular-nums">
            {overview.documentsSummary.count}
          </span>
        </Metric>
        <Metric
          label="Tareas abiertas"
          href={
            caseId
              ? `/crm/clientes/${client.id}/tareas?caseId=${caseId}`
              : `/crm/clientes/${client.id}/tareas`
          }
        >
          <span className="tabular-nums">
            {overview.tasksSummary.openCount}
          </span>
        </Metric>
        <Metric
          label="Pagos"
          href={
            caseId
              ? `/crm/clientes/${client.id}/pagos?caseId=${caseId}`
              : `/crm/clientes/${client.id}/pagos`
          }
        >
          <span className="text-xs tabular-nums">
            {formatMoney(overview.paymentsSummary.received)}
            {" / "}
            {overview.paymentsSummary.quoteTotal != null
              ? formatMoney(overview.paymentsSummary.quoteTotal)
              : "—"}
          </span>
        </Metric>
      </div>

      <PaymentsSummaryStrip
        clientId={client.id}
        clientPhone={client.phone}
        quoteTotal={overview.paymentsSummary.quoteTotal}
        received={overview.paymentsSummary.received}
        pending={overview.paymentsSummary.pending}
        currency={overview.paymentsSummary.currency}
        recent={overview.paymentsSummary.recent}
        payableQuote={overview.paymentsSummary.payableQuote}
        canRegisterPayment={canRegisterPayment}
      />

      {caseHref ? (
        <p className="text-[11px] text-text-secondary">
          Edición completa:{" "}
          <Link
            href={caseHref}
            className="font-medium text-action-primary hover:text-action-secondary"
          >
            caso {activeService?.caseCode}
          </Link>
          {creditHref ? (
            <>
              {" · "}
              <Link
                href={creditHref}
                className="font-medium text-action-primary hover:text-action-secondary"
              >
                crédito
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
