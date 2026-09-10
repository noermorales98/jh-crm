"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Modal, Pill } from "@/src/components/ui";
import { peekRoundAction } from "@/src/actions/client-overview";
import { formatDate } from "@/src/lib/format";
import {
  CREDIT_BUREAU_LABELS,
  ROUND_STATUS_LABELS,
  labelFor,
} from "@/src/lib/labels";

type PeekData = Extract<
  Awaited<ReturnType<typeof peekRoundAction>>,
  { ok: true }
>["data"];

export function RoundPeekModal({
  roundId,
  caseId,
  onClose,
}: {
  roundId: string | null;
  caseId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<PeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!roundId) {
      setData(null);
      setError(null);
      return;
    }
    setData(null);
    setError(null);
    startTransition(async () => {
      const result = await peekRoundAction(roundId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData(result.data);
    });
  }, [roundId]);

  return (
    <Modal
      open={!!roundId}
      onClose={onClose}
      title={data ? `Ronda #${data.roundNumber}` : "Ronda"}
      description={
        data ? labelFor(ROUND_STATUS_LABELS, data.status) : undefined
      }
    >
      {pending && !data ? (
        <p className="text-sm text-text-secondary">Cargando…</p>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {data ? (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-text-secondary">Preparada</dt>
              <dd className="tabular-nums">{formatDate(data.startedAt)}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Enviada</dt>
              <dd className="tabular-nums">
                {data.sentAt ? formatDate(data.sentAt) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Revisión esperada</dt>
              <dd className="tabular-nums">
                {data.expectedReviewAt
                  ? formatDate(data.expectedReviewAt)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Revisada</dt>
              <dd className="tabular-nums">
                {data.reviewedAt ? formatDate(data.reviewedAt) : "—"}
              </dd>
            </div>
          </dl>

          {data.items.length === 0 ? (
            <p className="text-xs text-text-secondary">Sin items en disputa.</p>
          ) : (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {data.items.map((it) => (
                <li
                  key={it.id}
                  className="rounded-control border border-border-subtle px-2 py-1.5 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-ink">{it.creditorName}</span>
                    <Pill tone="slate">
                      {CREDIT_BUREAU_LABELS[
                        it.bureau as keyof typeof CREDIT_BUREAU_LABELS
                      ] ?? it.bureau}
                    </Pill>
                    {it.outcome ? (
                      <Pill tone="green">{it.outcome}</Pill>
                    ) : (
                      <Pill tone="slate">{it.status}</Pill>
                    )}
                  </div>
                  <p className="mt-0.5 text-text-secondary">{it.disputeReason}</p>
                </li>
              ))}
            </ul>
          )}

          <Link
            href={`/crm/casos/${caseId}/rondas/${data.id}`}
            className="inline-block text-xs font-medium text-action-primary hover:text-action-secondary"
            onClick={onClose}
          >
            Ver ronda completa
          </Link>
        </div>
      ) : null}
    </Modal>
  );
}
