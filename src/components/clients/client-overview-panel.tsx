import Link from "next/link";
import type { ReactNode } from "react";
import { LineChart } from "lucide-react";
import type { getClientOverview } from "@/src/server/clients/overview";
import { formatDate } from "@/src/lib/format";
import {
  ACTIVITY_TYPE_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { Pill, ButtonLink, Card, CardBody } from "@/src/components/ui";
import { ScoreDelta } from "@/src/components/credit-reports/bureau-score-strip";
import { CreateCreditReportButton } from "@/src/components/credit-reports/create-report-button";
import { CreateCaseButton } from "@/src/components/cases/create-case-button";
import { ClientCreditWorkspace } from "@/src/components/clients/client-credit-workspace";
import { ClientOperationalRail } from "@/src/components/clients/client-operational-rail";
import { RoundsSummaryStrip } from "@/src/components/clients/rounds-summary-strip";
import { PaymentsSummaryStrip } from "@/src/components/clients/payments-summary-strip";

type Overview = Awaited<ReturnType<typeof getClientOverview>>;

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
      <div className="mt-0.5 text-sm font-medium tabular-nums text-ink">
        {children}
      </div>
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block transition-colors hover:opacity-90">
      {body}
    </Link>
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

  return (
    <div className="space-y-4">
      {/* Sin servicio activo */}
      {!activeService ? (
        <Card>
          <CardBody className="space-y-4">
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
            <div className="rounded-control border border-dashed border-border-subtle bg-surface-app/40 px-3 py-3">
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
          </CardBody>
        </Card>
      ) : null}

      {/* Layout principal: 8/4 cuando hay servicio */}
      {activeService ? (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="slate">{activeService.caseCode}</Pill>
                <span className="text-xs text-text-secondary">
                  {activeService.label}
                </span>
                {avgDelta != null ? (
                  <span className="text-xs text-text-secondary">
                    Progreso <ScoreDelta value={avgDelta} />
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {hasCreditChrome && caseHref ? (
                  <>
                    <ButtonLink href={caseHref} variant="primary" size="sm">
                      Ver caso
                    </ButtonLink>
                    {creditHref ? (
                      <ButtonLink href={creditHref} variant="ghost" size="sm">
                        Crédito
                      </ButtonLink>
                    ) : null}
                  </>
                ) : (
                  <ButtonLink
                    href={
                      activeService.creditCaseId
                        ? `/crm/casos/${activeService.creditCaseId}`
                        : `/crm/expedientes/${activeService.serviceCaseId}`
                    }
                    variant="primary"
                    size="sm"
                  >
                    Ver expediente
                  </ButtonLink>
                )}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-12">
              <div className="min-w-0 space-y-3 lg:col-span-8">
                {hasCreditChrome && credit ? (
                  !credit.canView ? (
                    <p className="text-sm text-text-secondary">
                      No tienes permiso para ver reportes de crédito.
                    </p>
                  ) : credit.reportCount === 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-dashed border-border-subtle bg-surface-app/40 px-3 py-2.5">
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
                            Registra el reporte inicial para ver scores y
                            evolución.
                          </p>
                        </div>
                      </div>
                      {canManageCredit && caseId ? (
                        <CreateCreditReportButton caseId={caseId} />
                      ) : null}
                    </div>
                  ) : caseId ? (
                    <ClientCreditWorkspace
                      bureaus={credit.bureaus}
                      scoreHistory={credit.scoreHistory}
                      hasChartData={credit.hasChartData}
                      rounds={credit.roundsSummary}
                      caseId={caseId}
                    />
                  ) : null
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FlatMetric label="Próxima acción">
                      {nextAction?.at ? (
                        <span>
                          <span className="block text-xs font-normal text-text-secondary">
                            {nextAction.label}
                          </span>
                          <span className="tabular-nums">
                            {formatDate(nextAction.at)}
                          </span>
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
                      <span className="tabular-nums">
                        {overview.documentsSummary.count}
                      </span>
                    </FlatMetric>
                  </div>
                )}
              </div>

              <div className="border-t border-border-subtle/40 pt-3 lg:col-span-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                <ClientOperationalRail
                  overview={overview}
                  clientId={client.id}
                  caseId={caseId}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* Zona inferior compacta — CREDIT_REPAIR */}
      {hasCreditChrome && credit && caseId ? (
        <Card>
          <CardBody className="space-y-4">
            <RoundsSummaryStrip
              rounds={credit.roundsSummary}
              currentRoundId={credit.currentRoundId}
              caseId={caseId}
              roundsTotal={credit.roundsTotal}
            />

            <div className="grid grid-cols-3 gap-3 text-center sm:max-w-md sm:text-left">
              <div>
                <p className="text-[10px] uppercase text-text-secondary">
                  Items activos
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
                <p className="text-[10px] uppercase text-text-secondary">Pend.</p>
                <p className="text-sm font-semibold tabular-nums text-ink">
                  {credit.itemsSummary.pending}
                </p>
              </div>
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

            <ActivityCompact
              clientId={client.id}
              activities={overview.latestActivities}
              lastActivity={lastActivity}
            />
          </CardBody>
        </Card>
      ) : null}

      {/* Zona inferior — otras verticales */}
      {activeService && !hasCreditChrome ? (
        <Card>
          <CardBody className="space-y-4">
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
            <ActivityCompact
              clientId={client.id}
              activities={overview.latestActivities}
              lastActivity={lastActivity}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function ActivityCompact({
  clientId,
  activities,
  lastActivity,
}: {
  clientId: string;
  activities: Overview["latestActivities"];
  lastActivity: Overview["lastActivity"];
}) {
  const rows = activities.length
    ? activities
    : lastActivity
      ? [
          {
            id: lastActivity.id,
            type: lastActivity.type,
            description: lastActivity.description,
            createdAt: lastActivity.createdAt,
          },
        ]
      : [];

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
          Actividad reciente
        </p>
        <Link
          href={`/crm/clientes/${clientId}/actividad`}
          className="text-[10px] font-medium text-action-primary hover:text-action-secondary"
        >
          Ver todo
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-text-secondary">Sin actividad reciente</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((a) => (
            <li key={a.id} className="text-xs text-text-secondary">
              <span className="font-medium text-ink">
                {labelFor(ACTIVITY_TYPE_LABELS, a.type)}
              </span>
              {" · "}
              <span className="line-clamp-1 inline">{a.description}</span>
              {" · "}
              <span className="tabular-nums">{formatDate(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
