"use client";

import { useState } from "react";
import type { ClientOverviewRound } from "@/src/server/clients/overview";
import { ROUND_STATUS_LABELS, labelFor } from "@/src/lib/labels";
import { formatDate } from "@/src/lib/format";
import { Tooltip } from "@/src/components/ui";
import { RoundPeekModal } from "@/src/components/clients/round-peek-modal";

export function RoundsSummaryStrip({
  rounds,
  currentRoundId,
  caseId,
  roundsTotal,
}: {
  rounds: ClientOverviewRound[];
  currentRoundId: string | null;
  caseId: string;
  roundsTotal: number;
}) {
  const [peekId, setPeekId] = useState<string | null>(null);

  if (rounds.length === 0) {
    return (
      <p className="text-xs text-text-secondary">Sin rondas todavía.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
          Rondas ({roundsTotal})
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {rounds.map((r) => {
          const current = r.id === currentRoundId;
          const tip = [
            r.sentAt ? `Enviada: ${formatDate(r.sentAt)}` : null,
            r.expectedReviewAt
              ? `Revisión: ${formatDate(r.expectedReviewAt)}`
              : null,
            r.reviewedAt ? `Revisada: ${formatDate(r.reviewedAt)}` : null,
            `Items: ${r.disputedItemsCount}`,
            labelFor(ROUND_STATUS_LABELS, r.status),
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li key={r.id}>
              <Tooltip content={<span className="text-xs">{tip}</span>}>
                <button
                  type="button"
                  onClick={() => setPeekId(r.id)}
                  className={
                    current
                      ? "rounded-full bg-action-primary px-2.5 py-0.5 text-xs font-medium text-white"
                      : "rounded-full border border-border-subtle bg-surface-panel px-2.5 py-0.5 text-xs font-medium text-ink hover:bg-nav-hover"
                  }
                >
                  #{r.roundNumber}{" "}
                  <span className={current ? "opacity-90" : "text-text-secondary"}>
                    {labelFor(ROUND_STATUS_LABELS, r.status)}
                  </span>
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      <RoundPeekModal
        roundId={peekId}
        caseId={caseId}
        onClose={() => setPeekId(null)}
      />
    </div>
  );
}
