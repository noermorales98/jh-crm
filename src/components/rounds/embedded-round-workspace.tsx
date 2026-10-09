"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, List } from "lucide-react";
import { loadEmbeddedRoundDetail } from "@/src/actions/embedded-round";
import type { EmbeddedRoundDetail } from "@/src/server/rounds/embedded-detail";
import { subscribeEmbedRefresh } from "@/src/lib/embed-refresh";
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
  DISPUTE_METHOD_LABELS,
  DISPUTE_SCOPE_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { DEFAULT_DISPUTE_SCOPE } from "@/src/lib/validation/disputes";
import { AddDisputeItemsButton } from "@/src/components/disputes/add-dispute-items-button";
import { DisputeOutcomeSelect } from "@/src/components/disputes/dispute-outcome-select";
import { CancelDisputeItemButton } from "@/src/components/disputes/cancel-dispute-item-button";
import { CreateLetterButton } from "@/src/components/letters/create-letter-button";
import { LetterActions } from "@/src/components/letters/letter-actions";
import { GenerateProgressReportButton } from "@/src/components/letters/generate-progress-report-button";
import { RoundActions } from "@/src/components/rounds/round-actions";

export function EmbeddedRoundWorkspace({
  roundId,
  onViewLetter,
}: {
  roundId: string;
  onViewLetter?: (letterId: string) => void;
}) {
  const [data, setData] = useState<EmbeddedRoundDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadEmbeddedRoundDetail({ roundId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [roundId, reloadKey]);

  useEffect(() => subscribeEmbedRefresh(reload), [reload]);

  if (loading && !data) {
    return (
      <p className="py-6 text-center text-[13px] text-text-secondary">
        Cargando ronda…
      </p>
    );
  }

  if (error || !data) {
    return (
      <p className="py-4 text-center text-sm text-danger">
        {error ?? "No se pudo cargar la ronda"}
      </p>
    );
  }

  const { round, summary, permissions } = data;
  const { byOutcome } = summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {permissions.canManageLetters ? (
          <GenerateProgressReportButton
            caseId={data.caseId}
            roundId={round.id}
            stayOnPage
            onCreated={() => reload()}
          />
        ) : null}
        {permissions.canManageLetters ? (
          <CreateLetterButton
            roundId={round.id}
            templates={data.templates}
            disputes={summary.items.map((i) => ({
              id: i.id,
              bureau: i.bureau,
              creditorName: i.creditItem.creditorName,
              disputeReason: i.disputeReason,
            }))}
          />
        ) : null}
        {permissions.canManageDisputes ? (
          <AddDisputeItemsButton
            roundId={round.id}
            eligible={data.eligible}
          />
        ) : null}
        {permissions.canManageRounds ? (
          <RoundActions
            roundId={round.id}
            status={round.status}
            members={data.members}
          />
        ) : null}
        <button
          type="button"
          onClick={reload}
          className="ml-auto text-[12px] font-medium text-action-primary"
        >
          Actualizar
        </button>
      </div>

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
          <p className="whitespace-pre-wrap border-t border-border-subtle px-1 py-3 text-sm text-text-secondary-strong">
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
              permissions.canManageDisputes ? (
                <AddDisputeItemsButton
                  roundId={round.id}
                  eligible={data.eligible}
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
                <TH>Alcance</TH>
                <TH>Método</TH>
                <TH>Estado</TH>
                <TH>Resultado</TH>
                {permissions.canManageDisputes ? <TH /> : null}
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
                  <TD className="text-sm text-text-secondary-strong">
                    {labelFor(
                      DISPUTE_SCOPE_LABELS,
                      item.scope ?? DEFAULT_DISPUTE_SCOPE,
                    )}
                  </TD>
                  <TD className="text-sm text-text-secondary-strong">
                    {item.method
                      ? labelFor(DISPUTE_METHOD_LABELS, item.method)
                      : "—"}
                  </TD>
                  <TD>
                    <Pill tone="slate">
                      {labelFor(DISPUTE_ITEM_STATUS_LABELS, item.status)}
                    </Pill>
                  </TD>
                  <TD>
                    {permissions.canManageDisputes ? (
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
                  {permissions.canManageDisputes ? (
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

      {permissions.canViewLetters ? (
        <Card>
          <CardHeader
            title="Cartas de disputa"
            description="Revisión humana obligatoria antes de marcar como final o enviada."
          />
          {data.letters.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Sin cartas"
              description="Genera una carta por buró a partir de los elementos seleccionados."
              action={
                permissions.canManageLetters ? (
                  <CreateLetterButton
                    roundId={round.id}
                    templates={data.templates}
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
                {data.letters.map((letter) => (
                  <TR key={letter.id}>
                    <TD>
                      {CREDIT_BUREAU_LABELS[letter.bureau] ?? letter.bureau}
                    </TD>
                    <TD className="max-w-[16rem] truncate text-sm">
                      {letter.subjectSnapshot}
                    </TD>
                    <TD>
                      <Pill tone="slate">
                        {labelFor(DISPUTE_LETTER_STATUS_LABELS, letter.status)}
                      </Pill>
                    </TD>
                    <TD className="tabular-nums">{letter.itemCount}</TD>
                    <TD className="text-right">
                      {permissions.canManageLetters ? (
                        <LetterActions
                          letterId={letter.id}
                          status={letter.status}
                          caseId={data.caseId}
                          roundId={round.id}
                          compact
                          onViewLetter={onViewLetter}
                          onChanged={reload}
                        />
                      ) : onViewLetter ? (
                        <button
                          type="button"
                          onClick={() => onViewLetter(letter.id)}
                          className="text-sm font-medium text-action-primary"
                        >
                          Ver
                        </button>
                      ) : (
                        <a
                          href={`/api/letters/${letter.id}/pdf`}
                          className="text-sm font-medium text-action-primary"
                        >
                          PDF
                        </a>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      {permissions.canViewLetters ? (
        <Card>
          <CardHeader
            title="Reportes de progreso"
            description="Snapshots en el historial. El PDF se descarga bajo demanda."
          />
          {data.progressReports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Sin reportes"
              description="Genera un reporte visual para el cliente desde esta ronda."
              action={
                permissions.canManageLetters ? (
                  <GenerateProgressReportButton
                    caseId={data.caseId}
                    roundId={round.id}
                    stayOnPage
                    onCreated={() => reload()}
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
                {data.progressReports.map((report) => (
                  <TR key={report.id}>
                    <TD className="tabular-nums text-sm">
                      {formatDate(report.reportDate)}
                    </TD>
                    <TD className="text-sm text-text-secondary">
                      {report.periodLabel}
                    </TD>
                    <TD className="text-right">
                      <a
                        href={`/api/progress-reports/${report.id}/pdf`}
                        className="text-sm font-medium text-action-primary"
                      >
                        PDF
                      </a>
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
