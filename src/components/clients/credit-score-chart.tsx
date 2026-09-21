"use client";

import { useMemo, useState } from "react";
import type { CreditBureau } from "@prisma/client";
import {
  ScoreEvolutionChart,
  type ScoreHistoryPoint,
  type ScorePointEvent,
} from "@/src/components/credit-reports/score-evolution-chart";
import { ScoreDelta } from "@/src/components/credit-reports/bureau-score-strip";
import { ReportPeekModal } from "@/src/components/clients/report-peek-modal";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import { formatDate } from "@/src/lib/format";

type HistoryRow = {
  reportId: string;
  label: string;
  reportDate: Date | string;
  scores: Record<CreditBureau, number | null>;
};

/**
 * Chart interactivo del hub cliente: hover local + ReportPeekModal al click.
 */
export function CreditScoreChart({
  history,
  caseId,
  compact = true,
  selectedReportId = null,
  onSelectReport,
}: {
  history: HistoryRow[];
  caseId: string;
  compact?: boolean;
  selectedReportId?: string | null;
  onSelectReport?: (reportId: string | null) => void;
}) {
  const [hover, setHover] = useState<ScorePointEvent | null>(null);
  const [peekReportId, setPeekReportId] = useState<string | null>(null);

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

  return (
    <div className="relative">
      <ScoreEvolutionChart
        history={points}
        compact={compact}
        interactive
        onPointHover={setHover}
        onPointClick={(ev) => {
          const row = history[ev.index];
          if (!row) return;
          onSelectReport?.(row.reportId);
          setPeekReportId(row.reportId);
        }}
      />
      {hover ? (
        <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[14rem] rounded-control border border-border-subtle bg-surface-elevated px-2 py-1.5 text-[11px]">
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
      {selectedReportId ? (
        <span className="sr-only">
          Reporte seleccionado: {selectedReportId}
        </span>
      ) : null}

      <ReportPeekModal
        reportId={peekReportId}
        caseId={caseId}
        onClose={() => {
          setPeekReportId(null);
          onSelectReport?.(null);
        }}
      />
    </div>
  );
}
