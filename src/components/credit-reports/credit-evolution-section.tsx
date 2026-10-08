import Link from "next/link";
import type { ReactNode } from "react";
import { LineChart } from "lucide-react";
import type {
  BureauScoreCurrent,
  ScoreRow,
} from "@/src/server/credit-reports";
import {
  Card,
  CardHeader,
  EmptyState,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { BureauScoreStrip } from "@/src/components/credit-reports/bureau-score-strip";
import { ScoreEvolutionChart } from "@/src/components/credit-reports/score-evolution-chart";

export function CreditEvolutionSection({
  current,
  history,
  emptyAction,
  reportHref,
}: {
  current: BureauScoreCurrent[];
  history: ScoreRow[];
  emptyAction?: ReactNode;
  /** Build href for a history row (report detail). */
  reportHref: (row: ScoreRow) => string;
}) {
  const chartHistory = history.map((row) => ({
    label: row.label,
    reportDate: row.reportDate.toISOString().slice(0, 10),
    scores: row.scores,
  }));

  return (
    <Card>
      <CardHeader
        title="Evolución del crédito"
        description="Puntajes actuales, diferencia respecto al reporte anterior e historial cronológico."
      />
      {history.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="Sin reportes registrados"
          description="Registra el reporte inicial para comenzar a seguir la evolución de puntajes."
          action={emptyAction ?? null}
        />
      ) : (
        <div className="space-y-6 px-4 pb-4 sm:px-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start">
            <BureauScoreStrip
              layout="stackOnDesktop"
              rows={current.map((row) => ({
                bureau: row.bureau,
                score: row.score,
                previousScore: row.previousScore,
                delta: row.delta,
              }))}
            />

            {history.some((h) =>
              Object.values(h.scores).some((s) => s != null),
            ) ? (
              <ScoreEvolutionChart history={chartHistory} fillDesktop />
            ) : null}
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Periodo</TH>
                <TH>Fecha</TH>
                <TH>Experian</TH>
                <TH>Equifax</TH>
                <TH>TransUnion</TH>
              </TR>
            </THead>
            <TBody>
              {history.map((row) => (
                <TR key={row.reportId}>
                  <TD>
                    <Link
                      href={reportHref(row)}
                      className="font-medium text-action-primary hover:text-action-secondary"
                    >
                      {row.label}
                    </Link>
                  </TD>
                  <TD className="tabular-nums text-text-secondary">
                    {formatDate(row.reportDate)}
                  </TD>
                  <TD className="tabular-nums">
                    {row.scores.EXPERIAN ?? "—"}
                  </TD>
                  <TD className="tabular-nums">
                    {row.scores.EQUIFAX ?? "—"}
                  </TD>
                  <TD className="tabular-nums">
                    {row.scores.TRANSUNION ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
