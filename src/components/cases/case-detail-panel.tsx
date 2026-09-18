import Link from "next/link";
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
  ButtonLink,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { formatMoney } from "@/src/lib/format/money";
import { ROUND_STATUS_LABELS, labelFor } from "@/src/lib/labels";
import { CaseStageSelect } from "@/src/components/cases/case-stage-select";
import { CaseStateActions } from "@/src/components/cases/case-state-actions";
import { CaseSummaryForm } from "@/src/components/cases/case-summary-form";
import { CaseAmountsForm } from "@/src/components/cases/case-amounts-form";
import { CaseNoteForm } from "@/src/components/cases/case-note-form";
import { CaseNextActionForm } from "@/src/components/cases/case-review-form";
import { CaseNextStepsCard } from "@/src/components/cases/case-next-steps-card";
import { CaseHeader } from "@/app/crm/casos/[caseId]/case-header";
import { CreditScoreGauge } from "@/src/components/clients/credit-score-gauge";

const BUREAU_SHORT: Record<string, string> = {
  EXPERIAN: "EXP",
  EQUIFAX: "EQX",
  TRANSUNION: "TU",
};

export async function CaseDetailPanel({ caseId }: { caseId: string }) {
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof caseService.getCaseDetail>>;
  try {
    detail = await caseService.getCaseDetail(ctx, caseId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const {
    case: creditCase,
    isCreditRepair,
    creditSnapshot,
    timeline,
    stageHistory,
    notes,
    caseBalance,
  } = detail;
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

  const processCard = (
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
            <dd className="text-[13px] text-ink">{formatDate(creditCase.openedAt)}</dd>
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
                new Date(creditCase.serviceCase.nextActionAt) < new Date() &&
                isOpen ? (
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
  );

  const creditCard =
    isCreditRepair && creditSnapshot ? (
      <Card>
        <CardHeader
          title="Crédito"
          actions={
            <ButtonLink href={`/crm/casos/${creditCase.id}/credito`} size="sm" variant="ghost">
              Ver detalle
            </ButtonLink>
          }
        />
        <CardBody className="space-y-4">
          {creditSnapshot.report ? (
            <div className="space-y-4">
              <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
                {(
                  ["EXPERIAN", "EQUIFAX", "TRANSUNION"] as const
                ).map((bureau) => {
                  const row = creditSnapshot.scores.find(
                    (s) => s.bureau === bureau,
                  );
                  return (
                    <CreditScoreGauge
                      key={bureau}
                      size="sm"
                      score={row?.score ?? null}
                      label={BUREAU_SHORT[bureau] ?? bureau}
                    />
                  );
                })}
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  Etapa
                </p>
                <div className="mt-1">
                  <StagePill
                    name={creditCase.stage.name}
                    color={creditCase.stage.color}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                Sin reporte de crédito aún.
              </p>
              <StagePill name={creditCase.stage.name} color={creditCase.stage.color} />
            </div>
          )}

          {creditSnapshot.activeRound ? (
            <div className="border-t border-border-subtle/50 pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                Ronda actual
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                #{creditSnapshot.activeRound.roundNumber}{" "}
                <span className="font-normal text-text-secondary">
                  {labelFor(
                    ROUND_STATUS_LABELS,
                    creditSnapshot.activeRound.status,
                  )}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Revisión:{" "}
                <span className="tabular-nums">
                  {creditSnapshot.activeRound.expectedReviewAt
                    ? formatDate(creditSnapshot.activeRound.expectedReviewAt)
                    : "—"}
                </span>
                {" · "}
                <Link
                  href={`/crm/casos/${creditCase.id}/rondas`}
                  className="font-medium text-action-primary hover:text-action-secondary"
                >
                  Ver rondas
                </Link>
              </p>
            </div>
          ) : null}
        </CardBody>
      </Card>
    ) : null;

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
          {creditCard}
          <CaseNextStepsCard steps={nextSteps} />
          {processCard}
        </div>

        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader
              title="Resumen"
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
                <p className="whitespace-pre-wrap text-sm text-text-secondary-strong">
                  {creditCase.summary ?? "Sin resumen."}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Dinero del expediente"
              description="Balance = monto acordado − pagos recibidos."
            />
            <CardBody className="space-y-5">
              <dl className="grid gap-3">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[12px] text-text-secondary">Acordado</dt>
                  <dd className="text-[13px] tabular-nums text-ink">
                    {caseBalance.agreedAmount
                      ? formatMoney(caseBalance.agreedAmount, caseBalance.currency)
                      : "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[12px] text-text-secondary">Recibido</dt>
                  <dd className="text-[13px] tabular-nums text-ink">
                    {formatMoney(caseBalance.paid, caseBalance.currency)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[12px] text-text-secondary">Pendiente de cobro</dt>
                  <dd className="text-[13px] tabular-nums text-ink">
                    {formatMoney(caseBalance.pending, caseBalance.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-control bg-surface-panel px-3 py-2.5">
                  <dt className="text-[12px] font-medium text-text-secondary">Balance</dt>
                  <dd className="text-[15px] font-semibold tabular-nums text-ink">
                    {caseBalance.balance
                      ? formatMoney(caseBalance.balance, caseBalance.currency)
                      : "Sin monto acordado"}
                  </dd>
                </div>
              </dl>

              {canManage ? (
                <div className="border-t border-border-subtle pt-4">
                  <CaseAmountsForm
                    caseId={creditCase.id}
                    initialQuoted={caseBalance.quotedAmount?.toString() ?? ""}
                    initialAgreed={caseBalance.agreedAmount?.toString() ?? ""}
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
                  <CaseNoteForm caseId={creditCase.id} />
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
