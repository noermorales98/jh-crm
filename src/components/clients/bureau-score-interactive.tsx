"use client";

import { useState } from "react";
import type { CreditBureau } from "@prisma/client";
import type {
  BureauProgress,
  ScoreHistoryPointDto,
} from "@/src/server/clients/overview";
import { ScoreDelta } from "@/src/components/credit-reports/bureau-score-strip";
import { Popover } from "@/src/components/ui";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import { formatDate } from "@/src/lib/format";

/**
 * Scores por buró: en compact, fila tipográfica sin cajas (Apple HIG).
 * Clic abre historial en popover.
 */
export function BureauScoreInteractive({
  bureaus,
  scoreHistory,
  compact = false,
}: {
  bureaus: BureauProgress[];
  scoreHistory: ScoreHistoryPointDto[];
  compact?: boolean;
}) {
  const [openBureau, setOpenBureau] = useState<CreditBureau | null>(null);

  return (
    <div
      className={
        compact
          ? "grid grid-cols-3 gap-2 sm:gap-6"
          : "grid gap-1.5 sm:grid-cols-3"
      }
    >
      {bureaus.map((b) => {
        const history = scoreHistory
          .map((h) => ({
            date: h.reportDate,
            label: h.label,
            score: h.scores[b.bureau],
          }))
          .filter((h) => h.score != null);

        const tip = [
          `Inicial: ${b.initial ?? "—"}`,
          `Actual: ${b.current ?? "—"}`,
          b.deltaFromInitial != null
            ? `Cambio: ${b.deltaFromInitial > 0 ? "+" : ""}${b.deltaFromInitial}`
            : null,
          b.reportDate ? `Última: ${formatDate(b.reportDate)}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <Popover
            key={b.bureau}
            open={openBureau === b.bureau}
            onOpenChange={(o) => setOpenBureau(o ? b.bureau : null)}
            align="start"
            trigger={
              <button
                type="button"
                title={tip}
                className={
                  compact
                    ? "flex min-h-11 w-full flex-col justify-center rounded-control px-1 py-1 text-left transition-colors hover:bg-nav-hover/40 motion-reduce:transition-none"
                    : "w-full rounded-control border border-border-subtle/50 bg-surface-panel/50 px-3 py-2 text-left transition-colors hover:border-action-primary/30"
                }
              >
                <p
                  className={`font-medium uppercase tracking-wide text-text-secondary ${
                    compact ? "text-[10px]" : "text-[10px]"
                  }`}
                >
                  {CREDIT_BUREAU_LABELS[b.bureau]}
                </p>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <p
                    className={`font-semibold tabular-nums tracking-[-0.02em] text-ink ${
                      compact ? "text-xl" : "text-xl"
                    }`}
                  >
                    {b.current ?? "—"}
                  </p>
                  <ScoreDelta
                    value={b.deltaFromInitial ?? b.deltaFromPrevious}
                  />
                </div>
                {!compact ? (
                  <p className="mt-0.5 text-xs text-text-secondary">
                    Inicial{" "}
                    <span className="tabular-nums">{b.initial ?? "—"}</span>
                    {b.reportDate ? (
                      <>
                        {" · "}
                        {formatDate(b.reportDate)}
                      </>
                    ) : null}
                  </p>
                ) : null}
              </button>
            }
          >
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {CREDIT_BUREAU_LABELS[b.bureau]}
              </p>
              {history.length === 0 ? (
                <p className="text-xs text-text-secondary">Sin historial.</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs tabular-nums">
                  {history.map((h, i) => (
                    <li
                      key={`${h.label}-${i}`}
                      className="flex justify-between gap-3"
                    >
                      <span className="text-text-secondary">
                        {formatDate(h.date)}
                      </span>
                      <span className="font-medium text-ink">{h.score}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Popover>
        );
      })}
    </div>
  );
}
