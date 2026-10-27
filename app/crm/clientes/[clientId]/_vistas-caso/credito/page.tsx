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
import { AnalyzePdfImportButton } from "@/src/components/credit-reports/analyze-pdf-import";
import { CreditPdfPendingConfirmBanner } from "@/src/components/credit-reports/credit-pdf-pending-confirm";
import { CreateComparisonButton } from "@/src/components/comparisons/create-comparison-button";
import { listPendingConfirmCreditPdfJobs } from "@/src/server/credit-import/jobs";
import { GenerateProgressReportButton } from "@/src/components/letters/generate-progress-report-button";
import { CreditEvolutionSection } from "@/src/components/credit-reports/credit-evolution-section";
import { CaseHeader } from "@/src/components/cases/case-header";
import { caseHref } from "@/src/lib/routes/case-routes";

export const metadata: Metadata = {
  title: "Crédito del caso",
};

export default async function CaseCreditPage({
  params,
}: {
  params: Promise<{ clientId: string; caseId: string }>;
}) {
  const { clientId, caseId } = await params;
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

  const canManage = can(ctx.role, "creditReports.manage");
  const [overview, comparisonList, progressReports, pendingPdfConfirms] =
    await Promise.all([
      creditReports.getCaseCreditOverview(ctx, caseId),
      can(ctx.role, "comparisons.view")
        ? comparisons.listComparisonsForCase(ctx, caseId)
        : Promise.resolve([]),
      can(ctx.role, "letters.view")
        ? progressService.listProgressReportsForCase(ctx, caseId)
        : Promise.resolve([]),
      canManage
        ? listPendingConfirmCreditPdfJobs(ctx, { caseId })
        : Promise.resolve([]),
    ]);
  const canCompare = can(ctx.role, "comparisons.manage");
  const canLetters = can(ctx.role, "letters.manage");
  const canViewLetters = can(ctx.role, "letters.view");
  const { case: creditCase } = detail;

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
              <>
                <AnalyzePdfImportButton caseId={creditCase.id} />
                <CreateCreditReportButton caseId={creditCase.id} />
              </>
            ) : null}
          </div>
        }
      />

      {pendingPdfConfirms.length > 0 ? (
        <CreditPdfPendingConfirmBanner jobs={pendingPdfConfirms} />
      ) : null}

      <CreditEvolutionSection
        current={overview.current}
        history={overview.history}
        emptyAction={
          canManage ? <CreateCreditReportButton caseId={creditCase.id} /> : null
        }
        reportHref={(row) =>
          caseHref(clientId, row.caseId, `/credito/reportes/${row.reportId}`)
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
                        href={caseHref(clientId, caseId, `/credito/reportes/${report.id}`)}
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
                          href={caseHref(clientId, caseId, `/reportes/${report.id}`)}
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
                        href={caseHref(clientId, caseId, `/comparaciones/${cmp.id}`)}
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
