import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as caseService from "@/src/server/cases";
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
import { CaseReviewForm } from "@/src/components/cases/case-review-form";
import { CaseHeader } from "./case-header";

export const metadata: Metadata = {
  title: "Caso",
};

export default async function CaseSummaryPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof caseService.getCaseDetail>>;
  try {
    detail = await caseService.getCaseDetail(ctx, caseId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { case: creditCase, timeline } = detail;
  const canManage = can(ctx.role, "cases.manage");
  const isOpen = creditCase.state === "OPEN";

  const [stages, members] = canManage
    ? await Promise.all([configService.listStages(ctx), listMemberOptions(ctx)])
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

              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Apertura</dt>
                  <dd className="text-ink">{formatDate(creditCase.openedAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Cierre</dt>
                  <dd className="text-ink">
                    {creditCase.closedAt ? formatDate(creditCase.closedAt) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Próxima revisión</dt>
                  <dd>
                    {creditCase.nextReviewAt ? (
                      new Date(creditCase.nextReviewAt) < new Date() && isOpen ? (
                        <Pill tone="red">
                          Vencida {formatDate(creditCase.nextReviewAt)}
                        </Pill>
                      ) : (
                        <span className="text-ink">
                          {formatDate(creditCase.nextReviewAt)}
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
                  <CaseReviewForm
                    caseId={creditCase.id}
                    initialDate={toDateInputValue(creditCase.nextReviewAt)}
                  />
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
