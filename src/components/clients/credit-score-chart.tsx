"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CreditBureau } from "@prisma/client";
import {
  ScoreEvolutionChart,
  type ScoreHistoryPoint,
  type ScorePointEvent,
} from "@/src/components/credit-reports/score-evolution-chart";
import { ScoreDelta } from "@/src/components/credit-reports/bureau-score-strip";
import { Modal, ButtonLink } from "@/src/components/ui";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import { formatDate } from "@/src/lib/format";

type HistoryRow = {
  reportId: string;
  label: string;
  reportDate: Date | string;
  scores: Record<CreditBureau, number | null>;
};

/**
 * Chart interactivo del hub cliente: hover local + modal al click.
 */
export function CreditScoreChart({
  history,
  caseId,
  compact = true,
}: {
  history: HistoryRow[];
  caseId: string;
  compact?: boolean;
}) {
  const [hover, setHover] = useState<ScorePointEvent | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const points: ScoreHistoryPoint[] = useMemo(
    () =>
      history.map((h) => ({
        reportId: h.reportId,
        label: h.label,
        reportDate:
          typeof h.reportDate === "string"
            ? h.reportDate.slice(0, 10)
            : h.reportDate.toISOString().slice(0, 10),
        scores: h.scores,
      })),
    [history],
  );

  const selected = selectedIdx != null ? history[selectedIdx] : null;
  const prev =
    selectedIdx != null && selectedIdx > 0 ? history[selectedIdx - 1] : null;

  function deltaFor(bureau: CreditBureau): number | null {
    if (!selected) return null;
    const cur = selected.scores[bureau];
    const p = prev?.scores[bureau] ?? null;
    if (cur == null || p == null) return null;
    return cur - p;
  }

  return (
    <div className="relative">
      <ScoreEvolutionChart
        history={points}
        compact={compact}
        interactive
        onPointHover={setHover}
        onPointClick={(ev) => setSelectedIdx(ev.index)}
      />
      {hover ? (
        <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[14rem] rounded-control border border-border-subtle bg-surface-elevated px-2 py-1.5 text-[11px] shadow-md">
          <p className="font-semibold text-ink">
            {CREDIT_BUREAU_LABELS[hover.bureau]}
          </p>
          <p className="text-text-secondary">{formatDate(hover.reportDate)}</p>
          <p className="mt-0.5 tabular-nums text-ink">
            Score: {hover.score}
            {hover.previousScore != null ? (
              <>
                {" · Ant. "}
                {hover.previousScore} · <ScoreDelta value={hover.delta} />
              </>
            ) : null}
          </p>
          <p className="text-text-secondary">{hover.label}</p>
        </div>
      ) : null}

      <Modal
        open={selected != null}
        onClose={() => setSelectedIdx(null)}
        title={selected ? selected.label : "Reporte"}
        description={
          selected ? formatDate(selected.reportDate) : undefined
        }
      >
        {selected ? (
          <div className="space-y-3">
            <ul className="space-y-1.5 text-sm">
              {(["EXPERIAN", "EQUIFAX", "TRANSUNION"] as CreditBureau[]).map(
                (b) => (
                  <li
                    key={b}
                    className="flex items-center justify-between gap-3 tabular-nums"
                  >
                    <span className="text-text-secondary">
                      {CREDIT_BUREAU_LABELS[b]}
                    </span>
                    <span className="font-medium text-ink">
                      {selected.scores[b] ?? "—"}{" "}
                      <ScoreDelta value={deltaFor(b)} />
                    </span>
                  </li>
                ),
              )}
            </ul>
            <p className="text-xs text-text-secondary">
              Cambio desde el reporte anterior (si existe). Sin afirmar
              causalidad con rondas.
            </p>
            <ButtonLink
              href={`/crm/casos/${caseId}/credito/reportes/${selected.reportId}`}
              size="sm"
              variant="secondary"
            >
              Ver reporte
            </ButtonLink>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
