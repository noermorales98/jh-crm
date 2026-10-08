import Link from "next/link";
import type { ReactNode } from "react";
import { LineChart } from "lucide-react";
import type { ClientCreditOverview } from "@/src/server/credit-reports";
import {
  Card,
  CardHeader,
  EmptyState,
  Pill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import {
  CREDIT_BUREAU_LABELS,
  CREDIT_REPORT_TYPE_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { CreditEvolutionSection } from "@/src/components/credit-reports/credit-evolution-section";

export function ClientCreditReportsPanel({
  overview,
  emptyAction,
  headerActions,
}: {
  overview: ClientCreditOverview;
  emptyAction?: ReactNode;
  headerActions?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      {headerActions ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {headerActions}
        </div>
      ) : null}

      <CreditEvolutionSection
        current={overview.current}
        history={overview.history}
        emptyAction={emptyAction}
        reportHref={(row) =>
          `/crm/casos/${row.caseId}/credito/reportes/${row.reportId}`
        }
      />

      <Card>
        <CardHeader
          title="Reportes"
          description={
            overview.negativeItemCount > 0
              ? `${overview.reports.length} reporte(s) · ${overview.negativeItemCount} elemento(s) negativo(s)`
              : `${overview.reports.length} reporte(s)`
          }
        />
        {overview.reports.length === 0 ? (
          <EmptyState
            icon={LineChart}
            title="Sin reportes"
            description="Los reportes estructurados aparecen aquí junto a sus puntajes e ítems."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Tipo</TH>
                <TH>Proveedor</TH>
                <TH>Scores</TH>
                <TH>Elementos</TH>
              </TR>
            </THead>
            <TBody>
              {[...overview.reports].reverse().map((report) => {
                const scoreBits = report.snapshots
                  .filter((s) => s.score != null)
                  .map(
                    (s) =>
                      `${CREDIT_BUREAU_LABELS[s.bureau].slice(0, 3)} ${s.score}`,
                  );
                return (
                  <TR key={report.id}>
                    <TD>
                      <Link
                        href={`/crm/casos/${report.caseId}/credito/reportes/${report.id}`}
                        className="font-medium text-action-primary hover:text-action-secondary"
                      >
                        {formatDate(report.reportDate)}
                      </Link>
                    </TD>
                    <TD>
                      <Pill tone="slate">
                        {labelFor(CREDIT_REPORT_TYPE_LABELS, report.type)}
                      </Pill>
                    </TD>
                    <TD className="text-text-secondary">
                      {report.provider ?? "—"}
                    </TD>
                    <TD className="text-sm tabular-nums text-text-secondary">
                      {scoreBits.length ? scoreBits.join(" · ") : "—"}
                    </TD>
                    <TD className="tabular-nums">{report._count.items}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
