import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { getServiceCaseDetail } from "@/src/server/service-cases";
import * as configService from "@/src/server/config";
import { toDateInputValue } from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import {
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Pill,
  StagePill,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  ButtonLink,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { formatMoney } from "@/src/lib/format/money";
import {
  FUNDING_APPLICATION_STATUS_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { FundingApplicationButton } from "@/src/components/funding/funding-application-button";
import { ServiceCaseStageSelect } from "@/src/components/service-cases/service-case-stage-select";
import { ServiceCaseStateActions } from "@/src/components/service-cases/service-case-state-actions";
import { ServiceCaseAmountsForm } from "@/src/components/service-cases/service-case-amounts-form";
import { ServiceCaseNoteForm } from "@/src/components/service-cases/service-case-note-form";
import { ServiceCaseNextActionForm } from "@/src/components/service-cases/service-case-next-action-form";

export const metadata: Metadata = {
  title: "Expediente",
};

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12px] text-text-secondary">{label}</dt>
      <dd className="text-right text-[13px] text-ink">{children}</dd>
    </div>
  );
}

/**
 * Fase 5 — ficha genérica del expediente (ServiceCase) para verticales sin
 * CreditCase: Home Buyer, Funding, Préstamo Personal y Proyectos.
 */
export default async function ServiceCasePage({
  params,
}: {
  params: Promise<{ serviceCaseId: string }>;
}) {
  const { serviceCaseId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof getServiceCaseDetail>>;
  try {
    detail = await getServiceCaseDetail(ctx, serviceCaseId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { serviceCase, stageHistory, notes, timeline, openTasks, balance } =
    detail;
  const canManage = can(ctx.role, "cases.manage");
  const isOpen = serviceCase.status === "OPEN" || serviceCase.status === "ON_HOLD";

  const stages = canManage
    ? await configService.listStages(ctx, false, serviceCase.service.id)
    : [];

  const homeBuyer = serviceCase.homeBuyerCase;
  const funding = serviceCase.fundingCase;
  const personalLoan = serviceCase.personalLoanCase;
  const project = serviceCase.projectCase;
  const creditCase = serviceCase.creditCase;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{serviceCase.caseNumber}</span>
            <StatusPill domain="serviceCase" value={serviceCase.status} />
          </span>
        }
        description={
          <>
            {serviceCase.service.name} · Cliente:{" "}
            <Link
              href={`/crm/clientes/${serviceCase.client.id}`}
              className="font-medium text-action-primary hover:text-action-secondary"
            >
              {serviceCase.client.firstName} {serviceCase.client.lastName}
            </Link>{" "}
            <span className="font-mono text-[11px]">
              ({serviceCase.client.clientCode})
            </span>
            {serviceCase.assignedTo?.name
              ? ` · Responsable: ${serviceCase.assignedTo.name}`
              : ""}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {creditCase ? (
              <ButtonLink
                href={`/crm/casos/${creditCase.id}`}
                variant="primary"
                size="sm"
              >
                Abrir reparación de crédito
              </ButtonLink>
            ) : null}
            {canManage ? (
              <ServiceCaseStateActions
                serviceCaseId={serviceCase.id}
                clientId={serviceCase.client.id}
                status={serviceCase.status}
              />
            ) : null}
          </div>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Estado del proceso" />
            <CardBody className="space-y-5">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Etapa actual
                </p>
                {canManage && isOpen ? (
                  <ServiceCaseStageSelect
                    serviceCaseId={serviceCase.id}
                    currentStageId={serviceCase.stage.id}
                    stages={stages}
                  />
                ) : (
                  <StagePill
                    name={serviceCase.stage.name}
                    color={serviceCase.stage.color}
                  />
                )}
              </div>

              <dl className="grid gap-3">
                <DetailRow label="Apertura">
                  {formatDate(serviceCase.startedAt)}
                </DetailRow>
                <DetailRow label="Cierre">
                  {serviceCase.completedAt
                    ? formatDate(serviceCase.completedAt)
                    : "—"}
                </DetailRow>
                <div className="flex items-center justify-between gap-4 rounded-control bg-surface-panel px-3 py-2.5">
                  <dt className="text-[12px] font-medium text-text-secondary">
                    Próxima acción
                  </dt>
                  <dd>
                    {serviceCase.nextActionAt ? (
                      new Date(serviceCase.nextActionAt) < new Date() &&
                      serviceCase.status === "OPEN" ? (
                        <Pill tone="red">
                          Vencida · {formatDate(serviceCase.nextActionAt)}
                        </Pill>
                      ) : (
                        <span className="font-medium text-ink">
                          {formatDate(serviceCase.nextActionAt)}
                        </span>
                      )
                    ) : (
                      <span className="text-text-secondary">Sin programar</span>
                    )}
                  </dd>
                </div>
              </dl>

              {canManage && isOpen ? (
                <div className="border-t border-border-subtle pt-4">
                  <ServiceCaseNextActionForm
                    serviceCaseId={serviceCase.id}
                    initialDate={toDateInputValue(serviceCase.nextActionAt)}
                  />
                </div>
              ) : null}

              {stageHistory.length > 0 ? (
                <div className="border-t border-border-subtle pt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Historial de etapas
                  </p>
                  <ul className="space-y-2">
                    {stageHistory.slice(0, 8).map((row) => (
                      <li
                        key={row.id}
                        className="text-xs text-text-secondary-strong"
                      >
                        <span className="text-text-secondary">
                          {row.fromStage?.name ?? "Inicio"}
                        </span>
                        {" → "}
                        <span className="font-medium text-ink">
                          {row.toStage.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-text-secondary">
                          {formatDate(row.changedAt)}
                          {row.changedBy?.name ? ` · ${row.changedBy.name}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>

          {openTasks.length > 0 ? (
            <Card>
              <CardHeader title="Tareas abiertas" />
              <CardBody className="p-0">
                <ul className="divide-y divide-border-subtle">
                  {openTasks.slice(0, 8).map((task) => (
                    <li key={task.id} className="px-5 py-3">
                      <p className="text-sm text-text-secondary-strong">
                        {task.title}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {task.dueAt ? `Vence ${formatDate(task.dueAt)}` : "Sin fecha"}
                        {task.assignedTo?.name ? ` · ${task.assignedTo.name}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6 lg:col-span-3">
          {homeBuyer ? (
            <Card>
              <CardHeader title="Compra de casa" description="HB-001 — datos del objetivo de compra." />
              <CardBody>
                <dl className="grid gap-3">
                  <DetailRow label="Presupuesto">
                    {homeBuyer.budgetMin || homeBuyer.budgetMax
                      ? `${homeBuyer.budgetMin ? formatMoney(homeBuyer.budgetMin, "USD") : "—"} – ${homeBuyer.budgetMax ? formatMoney(homeBuyer.budgetMax, "USD") : "—"}`
                      : "—"}
                  </DetailRow>
                  <DetailRow label="Zona objetivo">
                    {homeBuyer.targetArea ?? "—"}
                  </DetailRow>
                  <DetailRow label="Pre-aprobado">
                    {homeBuyer.preApproved
                      ? `Sí${homeBuyer.preApprovalAmount ? ` · ${formatMoney(homeBuyer.preApprovalAmount, "USD")}` : ""}`
                      : "No"}
                  </DetailRow>
                  <DetailRow label="Socio de referencia">
                    {homeBuyer.referralPartner ?? "—"}
                  </DetailRow>
                  {homeBuyer.summary ? (
                    <p className="whitespace-pre-wrap border-t border-border-subtle pt-3 text-sm text-text-secondary-strong">
                      {homeBuyer.summary}
                    </p>
                  ) : null}
                </dl>
              </CardBody>
            </Card>
          ) : null}

          {funding ? (
            <Card>
              <CardHeader
                title="Financiamiento de negocio"
                description="Seguimiento de aplicaciones a prestamistas."
                actions={canManage && isOpen ? <FundingApplicationButton serviceCaseId={serviceCase.id} /> : undefined}
              />
              <CardBody className="space-y-5">
                <dl className="grid gap-3">
                  <DetailRow label="Negocio">
                    {funding.businessName ?? "—"}
                  </DetailRow>
                  <DetailRow label="Antigüedad">
                    {funding.businessAgeMonths != null
                      ? `${funding.businessAgeMonths} meses`
                      : "—"}
                  </DetailRow>
                  <DetailRow label="Monto solicitado">
                    {funding.requestedAmount
                      ? formatMoney(funding.requestedAmount, "USD")
                      : "—"}
                  </DetailRow>
                  <DetailRow label="Propósito">
                    {funding.purpose ?? "—"}
                  </DetailRow>
                </dl>

                {funding.applications.length > 0 ? (
                  <div className="border-t border-border-subtle pt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                      Aplicaciones ({funding.applications.length})
                    </p>
                    <Table>
                      <THead>
                        <TR>
                          <TH>Prestamista</TH>
                          <TH>Estado</TH>
                          <TH>Solicitado</TH>
                          <TH>Aprobado</TH>
                          <TH>Fechas</TH>
                          {canManage && isOpen ? <TH>Acciones</TH> : null}
                        </TR>
                      </THead>
                      <TBody>
                        {funding.applications.map((app) => (
                          <TR key={app.id}>
                            <TD className="font-medium text-text-primary">
                              {app.lenderName}
                            </TD>
                            <TD>
                              {labelFor(
                                FUNDING_APPLICATION_STATUS_LABELS,
                                app.status,
                              )}
                            </TD>
                            <TD className="tabular-nums">
                              {app.requestedAmount
                                ? formatMoney(app.requestedAmount, "USD")
                                : "—"}
                            </TD>
                            <TD className="tabular-nums">
                              {app.approvedAmount
                                ? formatMoney(app.approvedAmount, "USD")
                                : "—"}
                            </TD>
                            <TD>
                              <div className="space-y-1 text-xs text-text-secondary">
                                <p>Envío: {app.submittedAt ? formatDate(app.submittedAt) : "—"}</p>
                                <p>Decisión: {app.decisionAt ? formatDate(app.decisionAt) : "—"}</p>
                                {app.notes ? <p className="max-w-xs whitespace-pre-wrap">{app.notes}</p> : null}
                              </div>
                            </TD>
                            {canManage && isOpen ? <TD><FundingApplicationButton serviceCaseId={serviceCase.id} initial={{
                              id: app.id, lenderName: app.lenderName, status: app.status,
                              requestedAmount: app.requestedAmount?.toString() ?? null, approvedAmount: app.approvedAmount?.toString() ?? null,
                              submittedAt: app.submittedAt?.toISOString() ?? null, decisionAt: app.decisionAt?.toISOString() ?? null,
                              notes: app.notes, updatedAt: app.updatedAt.toISOString(),
                            }} /></TD> : null}
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                ) : (
                  <p className="border-t border-border-subtle pt-4 text-sm text-text-secondary">
                    Sin aplicaciones registradas todavía.
                  </p>
                )}
              </CardBody>
            </Card>
          ) : null}

          {personalLoan ? (
            <Card>
              <CardHeader title="Préstamo personal" description="PL-001 — datos de la solicitud." />
              <CardBody>
                <dl className="grid gap-3">
                  <DetailRow label="Monto solicitado">
                    {personalLoan.requestedAmount
                      ? formatMoney(personalLoan.requestedAmount, "USD")
                      : "—"}
                  </DetailRow>
                  <DetailRow label="Propósito">
                    {personalLoan.purpose ?? "—"}
                  </DetailRow>
                  <DetailRow label="Plazo">
                    {personalLoan.termMonths != null
                      ? `${personalLoan.termMonths} meses`
                      : "—"}
                  </DetailRow>
                  {personalLoan.summary ? (
                    <p className="whitespace-pre-wrap border-t border-border-subtle pt-3 text-sm text-text-secondary-strong">
                      {personalLoan.summary}
                    </p>
                  ) : null}
                </dl>
              </CardBody>
            </Card>
          ) : null}

          {project ? (
            <Card>
              <CardHeader title="Proyecto" description="PJ-001 — datos del proyecto." />
              <CardBody>
                <dl className="grid gap-3">
                  <DetailRow label="Tipo de proyecto">
                    {project.projectType ?? "—"}
                  </DetailRow>
                  <DetailRow label="Entrega">
                    {project.deliveryUrl ?? "—"}
                  </DetailRow>
                  <DetailRow label="Repositorio">
                    {project.repositoryUrl ?? "—"}
                  </DetailRow>
                  {project.scopeSummary ? (
                    <p className="whitespace-pre-wrap border-t border-border-subtle pt-3 text-sm text-text-secondary-strong">
                      {project.scopeSummary}
                    </p>
                  ) : null}
                </dl>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Dinero del expediente"
              description="Balance = monto acordado − pagos recibidos."
            />
            <CardBody className="space-y-5">
              <dl className="grid gap-3">
                <DetailRow label="Acordado">
                  <span className="tabular-nums">
                    {balance.agreedAmount
                      ? formatMoney(balance.agreedAmount, balance.currency)
                      : "—"}
                  </span>
                </DetailRow>
                <DetailRow label="Recibido">
                  <span className="tabular-nums">
                    {formatMoney(balance.paid, balance.currency)}
                  </span>
                </DetailRow>
                <DetailRow label="Pendiente de cobro">
                  <span className="tabular-nums">
                    {formatMoney(balance.pending, balance.currency)}
                  </span>
                </DetailRow>
                <div className="flex items-center justify-between gap-4 rounded-control bg-surface-panel px-3 py-2.5">
                  <dt className="text-[12px] font-medium text-text-secondary">
                    Balance
                  </dt>
                  <dd className="text-[15px] font-semibold tabular-nums text-ink">
                    {balance.balance
                      ? formatMoney(balance.balance, balance.currency)
                      : "Sin monto acordado"}
                  </dd>
                </div>
              </dl>

              {canManage ? (
                <div className="border-t border-border-subtle pt-4">
                  <ServiceCaseAmountsForm
                    serviceCaseId={serviceCase.id}
                    initialQuoted={balance.quotedAmount?.toString() ?? ""}
                    initialAgreed={balance.agreedAmount?.toString() ?? ""}
                  />
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notas" />
            <CardBody className="space-y-4">
              {notes.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  Sin notas en este expediente.
                </p>
              ) : (
                <ul className="space-y-3">
                  {notes.slice(0, 10).map((note) => (
                    <li key={note.id}>
                      <p className="whitespace-pre-wrap text-sm text-text-secondary-strong">
                        {note.body}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {formatDate(note.createdAt)}
                        {note.author?.name ? ` · ${note.author.name}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {canManage ? (
                <div className="border-t border-border-subtle pt-4">
                  <ServiceCaseNoteForm serviceCaseId={serviceCase.id} />
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Historial reciente" />
            <CardBody className="p-0">
              {timeline.length === 0 ? (
                <p className="px-5 py-6 text-sm text-text-secondary">
                  Sin eventos registrados.
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {timeline.slice(0, 10).map((event) => (
                    <li key={event.id} className="px-5 py-3">
                      <p className="text-sm text-text-secondary-strong">
                        {event.description}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {formatDate(event.createdAt)}
                        {event.actor?.name ? ` · ${event.actor.name}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
