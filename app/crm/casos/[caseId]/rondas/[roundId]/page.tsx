import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, List } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as disputeService from "@/src/server/disputes";
import * as letterService from "@/src/server/letters";
import * as progressService from "@/src/server/progress-reports";
import { DomainError } from "@/src/server/errors";
import {
  Card,
  CardHeader,
  EmptyState,
  Pill,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate, formatMoney } from "@/src/lib/format";
import {
  CREDIT_BUREAU_LABELS,
  DISPUTE_ITEM_STATUS_LABELS,
  DISPUTE_LETTER_STATUS_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { AddDisputeItemsButton } from "@/src/components/disputes/add-dispute-items-button";
import { DisputeOutcomeSelect } from "@/src/components/disputes/dispute-outcome-select";
import { CancelDisputeItemButton } from "@/src/components/disputes/cancel-dispute-item-button";
import { CreateLetterButton } from "@/src/components/letters/create-letter-button";
import { LetterActions } from "@/src/components/letters/letter-actions";
import { GenerateProgressReportButton } from "@/src/components/letters/generate-progress-report-button";
import { RoundActions } from "@/src/components/rounds/round-actions";
import { listMemberOptions } from "@/src/server/page-helpers";
import { CaseHeader } from "../../case-header";

export const metadata: Metadata = {
  title: "Detalle de ronda",
};

export default async function RoundDetailPage({
  params,
}: {
  params: Promise<{ caseId: string; roundId: string }>;
}) {
  const { caseId, roundId } = await params;
  const ctx = await requireOrganization();

  if (!can(ctx.role, "rounds.view")) notFound();

  let detail: Awaited<ReturnType<typeof disputeService.getRoundDetail>>;
  try {
    detail = await disputeService.getRoundDetail(ctx, roundId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  if (detail.round.caseId !== caseId) notFound();

  const { round, summary } = detail;
  const canManageDisputes = can(ctx.role, "disputes.manage");
  const canManageRounds = can(ctx.role, "rounds.manage");
  const canManageLetters = can(ctx.role, "letters.manage");
  const members = canManageRounds ? await listMemberOptions(ctx) : [];
  const eligible = canManageDisputes
    ? await disputeService.listEligibleCreditItems(ctx, roundId)
    : [];
  const templates = canManageLetters
    ? await letterService.ensureDefaultTemplates(ctx)
    : [];
  const letters = can(ctx.role, "letters.view")
    ? await letterService.listLettersForRound(ctx, roundId)
    : [];
  const progressReports = can(ctx.role, "letters.view")
    ? await progressService.listProgressReportsForRound(ctx, roundId)
    : [];

  const { byOutcome } = summary;

  return (
    <div className="space-y-6">
      <CaseHeader
        creditCase={round.case}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManageLetters ? (
              <GenerateProgressReportButton
                caseId={caseId}
                roundId={round.id}
              />
            ) : null}
            {canManageLetters ? (
              <CreateLetterButton
                roundId={round.id}
                templates={templates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  bureau: t.bureau,
                }))}
                disputes={summary.items.map((i) => ({
                  id: i.id,
                  bureau: i.bureau,
                  creditorName: i.creditItem.creditorName,
                  disputeReason: i.disputeReason,
                }))}
              />
            ) : null}
            {canManageDisputes ? (
              <AddDisputeItemsButton
                roundId={round.id}
                eligible={eligible.map((i) => ({
                  id: i.id,
                  creditorName: i.creditorName,
                  accountNumberMasked: i.accountNumberMasked,
                  bureau: i.bureau,
                  balance: i.balance != null ? i.balance.toString() : null,
                  isNegative: i.isNegative,
                }))}
              />
            ) : null}
            {canManageRounds ? (
              <RoundActions
                roundId={round.id}
                status={round.status}
                members={members}
              />
            ) : null}
          </div>
        }
      />

      <p className="text-sm text-text-secondary">
        <Link
          href={`/crm/casos/${caseId}/rondas`}
          className="font-medium text-action-primary hover:text-action-secondary"
        >
          ← Rondas del caso
        </Link>
      </p>

      <Card>
        <CardHeader
          title={`Ronda #${round.roundNumber}`}
          description={`${summary.total} elementos disputados · ${round.lettersCount} cartas`}
        />
        <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
          <StatusPill domain="round" value={round.status} />
          <span className="text-sm text-text-secondary">
            Inicio {formatDate(round.startedAt)}
            {round.sentAt ? ` · Enviada ${formatDate(round.sentAt)}` : ""}
            {round.expectedReviewAt
              ? ` · Revisión ${formatDate(round.expectedReviewAt)}`
              : ""}
          </span>
        </div>
        <div className="grid gap-3 px-1 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Eliminados" value={byOutcome.deleted} />
          <Stat label="Actualizados" value={byOutcome.updated} />
          <Stat label="Verificados" value={byOutcome.verified} />
          <Stat
            label="Sin respuesta / pendientes"
            value={byOutcome.notResponded + byOutcome.pending}
          />
        </div>
        {round.notes ? (
          <p className="border-t border-border-subtle px-1 py-3 text-sm text-text-secondary-strong whitespace-pre-wrap">
            {round.notes}
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Elementos disputados"
          description="Lista completa de esta ronda"
        />
        {summary.items.length === 0 ? (
          <EmptyState
            icon={List}
            title="Sin elementos"
            description="Añade cuentas del reporte más reciente para disputarlas en esta ronda."
            action={
              canManageDisputes ? (
                <AddDisputeItemsButton
                  roundId={round.id}
                  eligible={eligible.map((i) => ({
                    id: i.id,
                    creditorName: i.creditorName,
                    accountNumberMasked: i.accountNumberMasked,
                    bureau: i.bureau,
                    balance: i.balance != null ? i.balance.toString() : null,
                    isNegative: i.isNegative,
                  }))}
                />
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Acreedor</TH>
                <TH>Buró</TH>
                <TH>Motivo</TH>
                <TH>Acción</TH>
                <TH>Estado</TH>
                <TH>Resultado</TH>
                {canManageDisputes ? <TH /> : null}
              </TR>
            </THead>
            <TBody>
              {summary.items.map((item) => (
                <TR key={item.id}>
                  <TD>
                    <div className="font-medium text-ink">
                      {item.creditItem.creditorName}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {item.creditItem.accountNumberMasked ?? "—"}
                      {item.creditItem.balance != null
                        ? ` · ${formatMoney(item.creditItem.balance)}`
                        : ""}
                    </div>
                  </TD>
                  <TD>{CREDIT_BUREAU_LABELS[item.bureau] ?? item.bureau}</TD>
                  <TD className="max-w-[14rem] text-sm text-text-secondary-strong">
                    {item.disputeReason}
                  </TD>
                  <TD className="text-sm text-text-secondary-strong">
                    {item.action ?? "—"}
                  </TD>
                  <TD>
                    <Pill tone="slate">
                      {labelFor(DISPUTE_ITEM_STATUS_LABELS, item.status)}
                    </Pill>
                  </TD>
                  <TD>
                    {canManageDisputes ? (
                      <DisputeOutcomeSelect
                        disputeItemId={item.id}
                        value={item.outcome}
                      />
                    ) : (
                      <span className="text-sm text-text-secondary">
                        {item.outcome
                          ? labelFor(
                              {
                                DELETED: "Eliminado",
                                UPDATED: "Actualizado",
                                VERIFIED: "Verificado",
                                NO_CHANGE: "Sin cambio",
                                NOT_RESPONDED: "Sin respuesta",
                                NEW_INFORMATION: "Nueva información",
                                OTHER: "Otro",
                              },
                              item.outcome,
                            )
                          : "Pendiente"}
                      </span>
                    )}
                  </TD>
                  {canManageDisputes ? (
                    <TD className="text-right">
                      <CancelDisputeItemButton
                        disputeItemId={item.id}
                        creditorName={item.creditItem.creditorName}
                      />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {can(ctx.role, "letters.view") ? (
        <Card>
          <CardHeader
            title="Cartas de disputa"
            description="Revisión humana obligatoria antes de marcar como final o enviada."
          />
          {letters.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Sin cartas"
              description="Genera una carta por buró a partir de los elementos seleccionados."
              action={
                canManageLetters ? (
                  <CreateLetterButton
                    roundId={round.id}
                    templates={templates.map((t) => ({
                      id: t.id,
                      name: t.name,
                      bureau: t.bureau,
                    }))}
                    disputes={summary.items.map((i) => ({
                      id: i.id,
                      bureau: i.bureau,
                      creditorName: i.creditItem.creditorName,
                      disputeReason: i.disputeReason,
                    }))}
                  />
                ) : null
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Buró</TH>
                  <TH>Asunto</TH>
                  <TH>Estado</TH>
                  <TH>Ítems</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {letters.map((letter) => (
                  <TR key={letter.id}>
                    <TD>{CREDIT_BUREAU_LABELS[letter.bureau]}</TD>
                    <TD className="max-w-[16rem] truncate text-sm">
                      {letter.subjectSnapshot}
                    </TD>
                    <TD>
                      <Pill tone="slate">
                        {labelFor(DISPUTE_LETTER_STATUS_LABELS, letter.status)}
                      </Pill>
                    </TD>
                    <TD className="tabular-nums">{letter._count.items}</TD>
                    <TD className="text-right">
                      {canManageLetters ? (
                        <LetterActions
                          letterId={letter.id}
                          status={letter.status}
                          caseId={caseId}
                          roundId={round.id}
                          compact
                        />
                      ) : (
                        <Link
                          href={`/crm/casos/${caseId}/rondas/${round.id}/cartas/${letter.id}`}
                          className="text-sm font-medium text-action-primary"
                        >
                          Ver
                        </Link>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      {can(ctx.role, "letters.view") ? (
        <Card>
          <CardHeader
            title="Reportes de progreso"
            description="Snapshots en el historial. Se ven en HTML; el PDF se descarga bajo demanda."
          />
          {progressReports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Sin reportes"
              description="Genera un reporte visual para el cliente desde esta ronda."
              action={
                canManageLetters ? (
                  <GenerateProgressReportButton
                    caseId={caseId}
                    roundId={round.id}
                  />
                ) : null
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Periodo</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {progressReports.map((report) => (
                  <TR key={report.id}>
                    <TD className="tabular-nums text-sm">
                      {formatDate(report.reportDate)}
                    </TD>
                    <TD className="text-sm text-text-secondary">
                      {report.periodLabel}
                    </TD>
                    <TD className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <Link
                          href={`/crm/casos/${caseId}/reportes/${report.id}`}
                          className="text-sm font-medium text-action-primary"
                        >
                          Ver
                        </Link>
                        <a
                          href={`/api/progress-reports/${report.id}/pdf`}
                          className="text-sm font-medium text-action-primary"
                        >
                          PDF
                        </a>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control border border-border-subtle bg-surface-panel/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
