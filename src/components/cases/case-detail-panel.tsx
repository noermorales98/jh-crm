import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as caseService from "@/src/server/cases";
import { getCaseNextSteps } from "@/src/server/cases/next-steps";
import * as configService from "@/src/server/config";
import { listMemberOptions, toDateInputValue } from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import {
  Card,
  CardBody,
  CardHeader,
  Pill,
  StagePill,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { CaseStageSelect } from "@/src/components/cases/case-stage-select";
import { CaseStateActions } from "@/src/components/cases/case-state-actions";
import { CaseSummaryForm } from "@/src/components/cases/case-summary-form";
import { CaseNextActionForm } from "@/src/components/cases/case-review-form";
import { CaseNextStepsCard } from "@/src/components/cases/case-next-steps-card";
import { CaseHeader } from "@/app/crm/casos/[caseId]/case-header";

export async function CaseDetailPanel({ caseId }: { caseId: string }) {
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof caseService.getCaseDetail>>;
  try {
    detail = await caseService.getCaseDetail(ctx, caseId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { case: creditCase, timeline, stageHistory } = detail;
  const canManage = can(ctx.role, "cases.manage");
  const isOpen = creditCase.state === "OPEN";
  const nextSteps = await getCaseNextSteps(ctx, caseId);

  const [stages, members] = canManage
    ? await Promise.all([
        configService.listStages(
          ctx,
          false,
          creditCase.serviceCase?.serviceId,
        ),
        listMemberOptions(ctx),
      ])
    : [[], []];

  return (
    <div>
      <CaseHeader
        creditCase={creditCase}
        actions={
          canManage ? (
            <CaseStateActions caseId={creditCase.id} state={creditCase.state} />
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <CaseNextStepsCard steps={nextSteps} />

          <Card>
            <CardHeader title="Estado del proceso" />
            <CardBody className="space-y-5">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Etapa actual
                </p>
                {canManage && isOpen ? (
                  <CaseStageSelect
                    caseId={creditCase.id}
                    currentStageId={creditCase.stage.id}
                    stages={stages}
                  />
                ) : (
                  <StagePill name={creditCase.stage.name} color={creditCase.stage.color} />
                )}
              </div>

              <dl className="grid gap-3">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[12px] text-text-secondary">Apertura</dt>
                  <dd className="text-[13px] text-ink">
                    {formatDate(creditCase.openedAt)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[12px] text-text-secondary">Cierre</dt>
                  <dd className="text-[13px] text-ink">
                    {creditCase.closedAt ? formatDate(creditCase.closedAt) : "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-control bg-surface-panel px-3 py-2.5">
                  <dt className="text-[12px] font-medium text-text-secondary">
                    Próxima acción
                  </dt>
                  <dd>
                    {creditCase.serviceCase.nextActionAt ? (
                      new Date(creditCase.serviceCase.nextActionAt) < new Date() && isOpen ? (
                        <Pill tone="red">
                          Vencida · {formatDate(creditCase.serviceCase.nextActionAt)}
                        </Pill>
                      ) : (
                        <span className="font-medium text-ink">
                          {formatDate(creditCase.serviceCase.nextActionAt)}
                        </span>
                      )
                    ) : (
                      <span className="text-text-secondary">Sin programar</span>
                    )}
                  </dd>
                </div>
              </dl>

              {canManage && isOpen ? (
                <div
                  id="proxima-accion"
                  className="scroll-mt-24 border-t border-border-subtle pt-4"
                >
                  <CaseNextActionForm
                    caseId={creditCase.id}
                    initialDate={toDateInputValue(creditCase.serviceCase.nextActionAt)}
                  />
                </div>
              ) : (
                <div id="proxima-accion" className="scroll-mt-24" />
              )}

              {stageHistory.length > 0 ? (
                <div className="border-t border-border-subtle pt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Historial de etapas
                  </p>
                  <ul className="space-y-2">
                    {stageHistory.slice(0, 8).map((row) => (
                      <li key={row.id} className="text-xs text-text-secondary-strong">
                        <span className="text-text-secondary">
                          {row.fromStage?.name ?? "Inicio"}
                        </span>
                        {" → "}
                        <span className="font-medium text-ink">{row.toStage.name}</span>
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
        </div>

        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader
              title="Resumen y responsable"
              description={
                canManage
                  ? "Información editable del caso."
                  : "Tu rol es de solo lectura."
              }
            />
            <CardBody>
              {canManage ? (
                <CaseSummaryForm
                  caseId={creditCase.id}
                  initialSummary={creditCase.summary ?? ""}
                  currentAssigneeId={creditCase.assignedTo?.id ?? null}
                  members={members}
                />
              ) : (
                <div className="space-y-3 text-sm">
                  <p>
                    <span className="text-text-secondary">Responsable: </span>
                    {creditCase.assignedTo?.name ?? "Sin asignar"}
                  </p>
                  <p className="whitespace-pre-wrap text-text-secondary-strong">
                    {creditCase.summary ?? "Sin resumen."}
                  </p>
                </div>
              )}
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
                      <p className="text-sm text-text-secondary-strong">{event.description}</p>
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
