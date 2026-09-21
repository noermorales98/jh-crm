"use client";

import { useState } from "react";
import type {
  BureauProgress,
  ClientOverviewRound,
  ScoreHistoryPointDto,
} from "@/src/server/clients/overview";
import { BureauScoreInteractive } from "@/src/components/clients/bureau-score-interactive";
import { CreditScoreChart } from "@/src/components/clients/credit-score-chart";
import { CreditTimeline } from "@/src/components/clients/credit-timeline";

/**
 * Columna izquierda CREDIT_REPAIR: scores + chart + timeline sincronizados.
 */
export function ClientCreditWorkspace({
  bureaus,
  scoreHistory,
  hasChartData,
  rounds,
  caseId,
}: {
  bureaus: BureauProgress[];
  scoreHistory: ScoreHistoryPointDto[];
  hasChartData: boolean;
  rounds: ClientOverviewRound[];
  caseId: string;
}) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  return (
    <div className="min-w-0 space-y-3">
      <BureauScoreInteractive
        bureaus={bureaus}
        scoreHistory={scoreHistory}
        compact
      />
      {hasChartData ? (
        <CreditScoreChart
          history={scoreHistory}
          caseId={caseId}
          compact
          selectedReportId={selectedReportId}
          onSelectReport={setSelectedReportId}
        />
      ) : scoreHistory.length === 1 ? (
        <p className="text-xs text-text-secondary">
          Un solo reporte: la gráfica aparecerá con el siguiente update.
        </p>
      ) : null}
      <CreditTimeline
        scoreHistory={scoreHistory}
        rounds={rounds}
        caseId={caseId}
        selectedReportId={selectedReportId}
        onSelectReport={setSelectedReportId}
      />
    </div>
  );
}
