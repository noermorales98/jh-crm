import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as caseService from "@/src/server/cases";
import * as creditReports from "@/src/server/credit-reports";
import * as comparisons from "@/src/server/comparisons";
import * as progressService from "@/src/server/progress-reports";
import { DomainError } from "@/src/server/errors";
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
import { CreateCreditReportButton } from "@/src/components/credit-reports/create-report-button";
import { CreateComparisonButton } from "@/src/components/comparisons/create-comparison-button";
import { GenerateProgressReportButton } from "@/src/components/letters/generate-progress-report-button";
import { ScoreEvolutionChart } from "@/src/components/credit-reports/score-evolution-chart";
import { BureauScoreStrip } from "@/src/components/credit-reports/bureau-score-strip";
import { CaseHeader } from "../case-header";

export const metadata: Metadata = {
  title: "Crédito del caso",
};

export default async function CaseCreditPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof caseService.getCaseDetail>>;
  try {
    detail = await caseService.getCaseDetail(ctx, caseId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  if (!can(ctx.role, "creditReports.view")) {
    notFound();
  }

  const overview = await creditReports.getCaseCreditOverview(ctx, caseId);
  const comparisonList = can(ctx.role, "comparisons.view")
    ? await comparisons.listComparisonsForCase(ctx, caseId)
    : [];
  const canManage = can(ctx.role, "creditReports.manage");
  const canCompare = can(ctx.role, "comparisons.manage");
  const canLetters = can(ctx.role, "letters.manage");
  const canViewLetters = can(ctx.role, "letters.view");
  const progressReports = canViewLetters
    ? await progressService.listProgressReportsForCase(ctx, caseId)
    : [];
  const { case: creditCase } = detail;

  const chartHistory = overview.history.map((row) => ({
    label: row.label,
    reportDate: row.reportDate.toISOString().slice(0, 10),
    scores: row.scores,
  }));

  return (
    <div className="space-y-6">
      <CaseHeader
        creditCase={creditCase}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canLetters ? (
              <GenerateProgressReportButton caseId={creditCase.id} />
            ) : null}
            {canCompare ? (
              <CreateComparisonButton
                caseId={creditCase.id}
                reports={overview.reports.map((r) => ({
                  id: r.id,
                  reportDate: r.reportDate,
                  type: r.type,
                }))}
              />
            ) : null}
            {canManage ? (
              <CreateCreditReportButton caseId={creditCase.id} />
            ) : null}
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Evolución del crédito"
          description="Puntajes actuales, diferencia respecto al reporte anterior e historial cronológico."
        />
        {overview.history.length === 0 ? (
          <EmptyState
            icon={LineChart}
            title="Sin reportes registrados"
            description="Registra el reporte inicial para comenzar a seguir la evolución de puntajes."
            action={
              canManage ? <CreateCreditReportButton caseId={creditCase.id} /> : null
            }
          />
        ) : (
          <div className="space-y-6 px-1 pb-2">
            <BureauScoreStrip
              rows={overview.current.map((row) => ({
                bureau: row.bureau,
                score: row.score,
                previousScore: row.previousScore,
                delta: row.delta,
              }))}
            />

            {overview.history.some((h) =>
              Object.values(h.scores).some((s) => s != null),
            ) ? (
              <ScoreEvolutionChart history={chartHistory} />
            ) : null}

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
                {overview.history.map((row) => (
                  <TR key={row.reportId}>
                    <TD>
                      <Link
                        href={`/crm/casos/${caseId}/credito/reportes/${row.reportId}`}
                        className="font-medium text-action-primary hover:text-action-secondary"
                      >
                        {row.label}
                      </Link>
                    </TD>
                    <TD className="tabular-nums text-text-secondary">
                      {formatDate(row.reportDate)}
                    </TD>
                    <TD className="tabular-nums">{row.scores.EXPERIAN ?? "—"}</TD>
                    <TD className="tabular-nums">{row.scores.EQUIFAX ?? "—"}</TD>
                    <TD className="tabular-nums">{row.scores.TRANSUNION ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

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
                        href={`/crm/casos/${caseId}/credito/reportes/${report.id}`}
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

      {canViewLetters ? (
        <Card>
          <CardHeader
            title="Reportes de progreso"
            description="Historial de snapshots para el cliente (HTML; PDF bajo demanda)."
          />
          {progressReports.length === 0 ? (
            <EmptyState
              icon={LineChart}
              title="Sin reportes de progreso"
              description="Genera un resumen visual con puntajes y resultados."
              action={
                canLetters ? (
                  <GenerateProgressReportButton caseId={creditCase.id} />
                ) : null
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Periodo</TH>
                  <TH>Ronda</TH>
                  <TH className="text-right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {progressReports.map((report) => (
                  <TR key={report.id}>
                    <TD className="tabular-nums text-sm">
                      {formatDate(report.reportDate)}
                    </TD>
                    <TD className="text-sm text-text-secondary">
                      {report.periodLabel}
                    </TD>
                    <TD className="text-sm text-text-secondary">
                      {report.roundLabel}
                    </TD>
                    <TD className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <Link
                          href={`/crm/casos/${caseId}/reportes/${report.id}`}
                          className="text-sm font-medium text-action-primary"
                        >
                          Ver
                        </Link>
                        <a
                          href={`/api/progress-reports/${report.id}/pdf`}
                          className="text-sm font-medium text-action-primary"
                        >
                          PDF
                        </a>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      {can(ctx.role, "comparisons.view") ? (
        <Card>
          <CardHeader
            title="Comparaciones"
            description="Resultados entre reportes (base vs actualizado)."
          />
          {comparisonList.length === 0 ? (
            <EmptyState
              icon={LineChart}
              title="Sin comparaciones"
              description="Necesitas al menos dos reportes para comparar."
              action={
                canCompare ? (
                  <CreateComparisonButton
                    caseId={creditCase.id}
                    reports={overview.reports.map((r) => ({
                      id: r.id,
                      reportDate: r.reportDate,
                      type: r.type,
                    }))}
                  />
                ) : null
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Base</TH>
                  <TH>Actualizado</TH>
                  <TH>Ítems</TH>
                </TR>
              </THead>
              <TBody>
                {comparisonList.map((cmp) => (
                  <TR key={cmp.id}>
                    <TD>
                      <Link
                        href={`/crm/casos/${caseId}/comparaciones/${cmp.id}`}
                        className="font-medium text-action-primary hover:text-action-secondary"
                      >
                        {formatDate(cmp.createdAt)}
                      </Link>
                    </TD>
                    <TD className="text-text-secondary">
                      {formatDate(cmp.baseReport.reportDate)} ·{" "}
                      {labelFor(CREDIT_REPORT_TYPE_LABELS, cmp.baseReport.type)}
                    </TD>
                    <TD className="text-text-secondary">
                      {formatDate(cmp.compareReport.reportDate)} ·{" "}
                      {labelFor(
                        CREDIT_REPORT_TYPE_LABELS,
                        cmp.compareReport.type,
                      )}
                    </TD>
                    <TD className="tabular-nums">{cmp._count.items}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
