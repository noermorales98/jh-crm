"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { getClientOverview } from "@/src/server/clients/overview";
import { StagePill } from "@/src/components/ui";
import { formatDate, formatMoney } from "@/src/lib/format";
import {
  DOCUMENT_CATEGORY_LABELS,
  ROUND_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { RoundPeekModal } from "@/src/components/clients/round-peek-modal";

type Overview = Awaited<ReturnType<typeof getClientOverview>>;

/**
 * Rail operativo compacto del Client 360 (derecha en desktop).
 * Sin cards grandes: next action, etapa, ronda, tareas, docs, balance.
 */
export function ClientOperationalRail({
  overview,
  clientId,
  caseId,
}: {
  overview: Overview;
  clientId: string;
  caseId: string | null;
}) {
  const {
    activeService,
    nextAction,
    credit,
    tasksSummary,
    documentsSummary,
    paymentsSummary,
  } = overview;
  const [peekRoundId, setPeekRoundId] = useState<string | null>(null);

  const tasksHref = caseId
    ? `/crm/clientes/${clientId}/tareas?caseId=${caseId}`
    : `/crm/clientes/${clientId}/tareas`;
  const docsHref = `/crm/clientes/${clientId}/documentos`;
  const balancePending =
    paymentsSummary.quoteTotal != null
      ? Math.max(
          0,
          paymentsSummary.quoteTotal - paymentsSummary.received,
        )
      : paymentsSummary.pending;

  return (
    <aside className="space-y-3 text-sm">
      <RailBlock label="Próxima acción">
        {nextAction?.at ? (
          <>
            <p className="text-xs text-text-secondary">{nextAction.label}</p>
            <p className="text-base font-medium tabular-nums tracking-[-0.02em] text-ink">
              {formatDate(nextAction.at)}
            </p>
          </>
        ) : (
          <p className="text-text-secondary">
            {nextAction?.label ?? "Sin fecha programada"}
          </p>
        )}
      </RailBlock>

      <RailBlock label="Etapa">
        {activeService?.stage ? (
          <StagePill
            name={activeService.stage.name}
            color={activeService.stage.color}
          />
        ) : (
          <span className="text-text-secondary">—</span>
        )}
      </RailBlock>

      {credit?.round && caseId ? (
        <RailBlock label="Ronda actual">
          <button
            type="button"
            className="w-full rounded-control text-left outline-none transition-colors hover:bg-nav-hover/40 focus-visible:ring-2 focus-visible:ring-action-primary"
            aria-label={`Ronda ${credit.round.roundNumber}, ${labelFor(ROUND_STATUS_LABELS, credit.round.status)}`}
            onClick={() => setPeekRoundId(credit.round!.id)}
          >
            <p className="font-medium text-ink">
              #{credit.round.roundNumber}{" "}
              <span className="font-normal text-text-secondary">
                {labelFor(ROUND_STATUS_LABELS, credit.round.status)}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Revisión:{" "}
              <span className="tabular-nums">
                {credit.round.expectedReviewAt
                  ? formatDate(credit.round.expectedReviewAt)
                  : "—"}
              </span>
              {" · "}
              Items:{" "}
              <span className="tabular-nums">
                {credit.round.disputedItemsCount}
              </span>
            </p>
          </button>
          <RoundPeekModal
            roundId={peekRoundId}
            caseId={caseId}
            onClose={() => setPeekRoundId(null)}
          />
        </RailBlock>
      ) : null}

      <RailBlock
        label="Tareas"
        href={tasksHref}
        meta={`${tasksSummary.openCount} abiertas`}
      >
        {tasksSummary.priority.length === 0 ? (
          <p className="text-xs text-text-secondary">Sin tareas urgentes</p>
        ) : (
          <ul className="space-y-1.5">
            {tasksSummary.priority.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/crm/tareas/${t.id}`}
                  className="block rounded-control outline-none hover:bg-nav-hover/40 focus-visible:ring-2 focus-visible:ring-action-primary"
                >
                  <p className="line-clamp-1 text-xs font-medium text-ink">
                    {t.title}
                  </p>
                  <p className="text-[10px] text-text-secondary">
                    {labelFor(TASK_PRIORITY_LABELS, t.priority)}
                    {t.dueAt ? (
                      <>
                        {" · "}
                        <span className="tabular-nums">
                          {formatDate(t.dueAt)}
                        </span>
                      </>
                    ) : null}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </RailBlock>

      <RailBlock label="Documentos" href={docsHref}>
        <p className="tabular-nums text-ink">
          <span className="font-medium">{documentsSummary.complete}</span>{" "}
          completos
          {documentsSummary.pending > 0 ? (
            <>
              {" · "}
              <span className="font-medium">{documentsSummary.pending}</span>{" "}
              pendientes
            </>
          ) : null}
        </p>
        {documentsSummary.missing.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
            {documentsSummary.missing.map((m) => (
              <li key={m.category}>
                Falta {labelFor(DOCUMENT_CATEGORY_LABELS, m.category)}
              </li>
            ))}
          </ul>
        ) : null}
      </RailBlock>

      <RailBlock
        label="Balance"
        href={
          caseId
            ? `/crm/clientes/${clientId}/pagos?caseId=${caseId}`
            : `/crm/clientes/${clientId}/pagos`
        }
      >
        <dl className="grid grid-cols-3 gap-1 text-xs">
          <div>
            <dt className="text-text-secondary">Acuerdo</dt>
            <dd className="font-medium tabular-nums text-ink">
              {paymentsSummary.quoteTotal != null
                ? formatMoney(paymentsSummary.quoteTotal)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">Pagado</dt>
            <dd className="font-medium tabular-nums text-ink">
              {formatMoney(paymentsSummary.received)}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">Pendiente</dt>
            <dd className="font-medium tabular-nums text-ink">
              {formatMoney(balancePending)}
            </dd>
          </div>
        </dl>
      </RailBlock>
    </aside>
  );
}

function RailBlock({
  label,
  children,
  href,
  meta,
}: {
  label: string;
  children: ReactNode;
  href?: string;
  meta?: string;
}) {
  return (
    <div className="border-b border-border-subtle/50 pb-3 last:border-b-0 last:pb-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        {href ? (
          <Link
            href={href}
            className="text-[10px] font-medium uppercase tracking-wide text-text-secondary hover:text-ink"
          >
            {label}
          </Link>
        ) : (
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            {label}
          </p>
        )}
        {meta ? (
          <span className="text-[10px] tabular-nums text-text-placeholder">
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
