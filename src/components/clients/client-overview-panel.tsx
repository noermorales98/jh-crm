import Link from "next/link";
import type { ReactNode } from "react";
import { LineChart } from "lucide-react";
import type { CreditBureau } from "@prisma/client";
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
import { CreditScoreGauge } from "@/src/components/clients/credit-score-gauge";
import { CreditScoreChart } from "@/src/components/clients/credit-score-chart";
import { RoundsSummaryStrip } from "@/src/components/clients/rounds-summary-strip";
import { PaymentsSummaryStrip } from "@/src/components/clients/payments-summary-strip";

type Overview = Awaited<ReturnType<typeof getClientOverview>>;

const BUREAU_SHORT: Record<CreditBureau, string> = {
  EXPERIAN: "EXP",
  EQUIFAX: "EQX",
  TRANSUNION: "TU",
};

const BUREAU_ORDER: CreditBureau[] = ["EXPERIAN", "EQUIFAX", "TRANSUNION"];

function FlatMetric({
  label,
  children,
  href,
}: {
  label: string;
  children: ReactNode;
  href?: string;
}) {
  const body = (
    <div className="min-w-0">
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

function ServiceMetricsRow({
  overview,
  activeService,
  nextAction,
}: {
  overview: Overview;
  activeService: NonNullable<Overview["activeService"]>;
  nextAction: Overview["nextAction"];
}) {
  const { client } = overview;
  const scId = activeService.serviceCaseId;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="slate">{activeService.caseCode}</Pill>
          <span className="text-xs text-text-secondary">{activeService.label}</span>
        </div>
        <ButtonLink
          href={
            activeService.creditCaseId
              ? `/crm/casos/${activeService.creditCaseId}`
              : `/crm/expedientes/${scId}`
          }
          variant="primary"
          size="sm"
        >
          Ver expediente
        </ButtonLink>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FlatMetric label="Etapa">
          {activeService.stage ? (
            <StagePill
              name={activeService.stage.name}
              color={activeService.stage.color}
            />
          ) : (
            "—"
          )}
        </FlatMetric>
        <FlatMetric label="Próxima acción">
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
        </FlatMetric>
        <FlatMetric
          label="Documentos"
          href={`/crm/clientes/${client.id}/documentos`}
        >
          <span className="tabular-nums">{overview.documentsSummary.count}</span>
        </FlatMetric>
        <FlatMetric
          label="Pagos"
          href={`/crm/clientes/${client.id}/pagos`}
        >
          <span className="text-xs tabular-nums">
            {formatMoney(overview.paymentsSummary.received)}
            {" / "}
            {overview.paymentsSummary.quoteTotal != null
              ? formatMoney(overview.paymentsSummary.quoteTotal)
              : "—"}
          </span>
        </FlatMetric>
      </div>
    </section>
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
  const isCreditRepair = activeService?.kind === "CREDIT_REPAIR";
  const caseId = activeService?.creditCaseId ?? null;
  const caseHref = caseId ? `/crm/casos/${caseId}` : null;
  const creditHref = caseId ? `/crm/casos/${caseId}/credito` : null;
  const hasCreditChrome = Boolean(isCreditRepair && credit);

  const avgDelta = credit?.bureaus
    ? (() => {
        const vals = credit.bureaus
          .map((b) => b.deltaFromInitial)
          .filter((v): v is number => v != null);
        if (vals.length === 0) return null;
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      })()
    : null;

  const bureauByCode = new Map(
    (credit?.bureaus ?? []).map((b) => [b.bureau, b] as const),
  );

  return (
    <div className="space-y-5">
      {/* Sin servicio activo: métricas planas + CTA crear */}
      {!activeService ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <FlatMetric label="Etapa">
              {services.length === 0 ? (
                <span className="text-text-secondary">Sin servicio</span>
              ) : (
                "—"
              )}
            </FlatMetric>
            <FlatMetric label="Próxima acción">
              <span className="text-text-secondary">Sin fecha</span>
            </FlatMetric>
            <FlatMetric
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
            </FlatMetric>
          </div>
          <div className="rounded-control border border-dashed border-border-subtle px-3 py-3">
            <p className="text-sm font-medium text-ink">Sin expediente</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Crea un caso para ver etapa, documentos y progreso aquí.
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
        </>
      ) : null}

      {/* Servicio activo no CREDIT_REPAIR */}
      {activeService && !hasCreditChrome ? (
        <ServiceMetricsRow
          overview={overview}
          activeService={activeService}
          nextAction={nextAction}
        />
      ) : null}

      {/* CREDIT_REPAIR: hero 3 gauges + acción + etapa */}
      {hasCreditChrome && credit ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="slate">{activeService!.caseCode}</Pill>
              {avgDelta != null ? (
                <span className="text-xs text-text-secondary">
                  Progreso <ScoreDelta value={avgDelta} />
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {caseHref ? (
                <ButtonLink href={caseHref} variant="primary" size="sm">
                  Ver caso
                </ButtonLink>
              ) : null}
              {creditHref ? (
                <ButtonLink href={creditHref} variant="ghost" size="sm">
                  Crédito
                </ButtonLink>
              ) : null}
            </div>
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
            <>
              <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
                <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
                  {BUREAU_ORDER.map((bureau) => {
                    const row = bureauByCode.get(bureau);
                    return (
                      <CreditScoreGauge
                        key={bureau}
                        size="sm"
                        score={row?.current ?? null}
                        label={BUREAU_SHORT[bureau]}
                        delta={row?.deltaFromInitial ?? null}
                      />
                    );
                  })}
                </div>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <FlatMetric label="Etapa">
                    {activeService?.stage ? (
                      <StagePill
                        name={activeService.stage.name}
                        color={activeService.stage.color}
                      />
                    ) : (
                      "—"
                    )}
                  </FlatMetric>
                  <FlatMetric label="Próxima acción">
                    {nextAction?.at ? (
                      <span>
                        <span className="block text-xs font-normal text-text-secondary">
                          {nextAction.label}
                        </span>
                        <span className="text-base tabular-nums tracking-[-0.02em]">
                          {formatDate(nextAction.at)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-text-secondary">
                        {nextAction?.label ?? "Sin fecha"}
                      </span>
                    )}
                  </FlatMetric>
                </div>
              </div>
            </>
          )}

          <details className="overflow-hidden rounded-surface ring-1 ring-border-subtle/40">
            <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-text-secondary marker:content-none [&::-webkit-details-marker]:hidden">
              Más detalle de crédito
              <span className="ml-1.5 font-normal normal-case tracking-normal text-text-placeholder">
                · burós · gráfica · rondas · pagos
              </span>
            </summary>
            <div className="space-y-4 border-t border-border-subtle/40 px-4 py-4">
              {credit.canView && credit.reportCount > 0 ? (
                <>
                  <BureauScoreInteractive
                    bureaus={credit.bureaus}
                    scoreHistory={credit.scoreHistory}
                    compact
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
                        <p className="text-xs text-text-secondary">
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
                      <div>
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
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-[10px] uppercase text-text-secondary">
                            Activos
                          </p>
                          <p className="text-sm font-semibold tabular-nums text-ink">
                            {credit.itemsSummary.active}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-text-secondary">
                            Resueltos
                          </p>
                          <p className="text-sm font-semibold tabular-nums text-ink">
                            {credit.itemsSummary.resolved}
                          </p>
                        </div>
                        <div>
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
                </>
              ) : null}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <FlatMetric
                  label="Rondas"
                  href={caseHref ? `${caseHref}/rondas` : undefined}
                >
                  <span className="tabular-nums">{credit.roundsTotal}</span>
                </FlatMetric>
                <FlatMetric
                  label="Documentos"
                  href={`/crm/clientes/${client.id}/documentos`}
                >
                  <span className="tabular-nums">
                    {overview.documentsSummary.count}
                  </span>
                </FlatMetric>
                <FlatMetric
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
                </FlatMetric>
                <FlatMetric
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
                </FlatMetric>
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
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
