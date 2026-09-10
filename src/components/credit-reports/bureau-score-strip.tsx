import type { CreditBureau } from "@prisma/client";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import { formatDate } from "@/src/lib/format";

export function ScoreDelta({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-text-placeholder">—</span>;
  }
  const tone =
    value > 0
      ? "text-success-ink"
      : value < 0
        ? "text-danger-ink"
        : "text-text-secondary";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`font-medium tabular-nums ${tone}`}>
      {sign}
      {value}
    </span>
  );
}

export type BureauScoreStripRow = {
  bureau: CreditBureau;
  score: number | null;
  previousScore?: number | null;
  delta: number | null;
  /** Si true, muestra "Inicial → Actual" en lugar de "Anterior". */
  showInitial?: boolean;
  initialScore?: number | null;
  reportDate?: Date | string | null;
};

/**
 * Tres burós en fila compacta: score + delta (y opcional inicial).
 */
export function BureauScoreStrip({
  rows,
  compact = false,
}: {
  rows: BureauScoreStripRow[];
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-2 sm:grid-cols-3 ${compact ? "" : "gap-3"}`}>
      {rows.map((row) => (
        <div
          key={row.bureau}
          className={
            compact
              ? "rounded-control border border-border-subtle bg-surface-panel/50 px-3 py-2"
              : "rounded-control border border-border-subtle bg-surface-panel/60 px-4 py-3"
          }
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            {CREDIT_BUREAU_LABELS[row.bureau]}
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <p
              className={`font-semibold tabular-nums text-ink ${
                compact ? "text-xl" : "text-2xl"
              }`}
            >
              {row.score ?? "—"}
            </p>
            <ScoreDelta value={row.delta} />
          </div>
          {row.showInitial ? (
            <p className="mt-0.5 text-xs text-text-secondary">
              Inicial{" "}
              <span className="tabular-nums">{row.initialScore ?? "—"}</span>
              {row.reportDate ? (
                <>
                  {" · "}
                  {formatDate(row.reportDate)}
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-text-secondary">
              Anterior{" "}
              <span className="tabular-nums">{row.previousScore ?? "—"}</span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
