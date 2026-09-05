import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as comparisonService from "@/src/server/comparisons";
import { DomainError } from "@/src/server/errors";
import {
  Card,
  CardHeader,
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
  COMPARISON_RESULT_LABELS,
  CREDIT_BUREAU_LABELS,
  CREDIT_REPORT_TYPE_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { ComparisonResultOverride } from "@/src/components/comparisons/comparison-result-override";
import { CaseHeader } from "../../case-header";

export const metadata: Metadata = {
  title: "Comparación de reportes",
};

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-placeholder">—</span>;
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

export default async function ComparisonDetailPage({
  params,
}: {
  params: Promise<{ caseId: string; comparisonId: string }>;
}) {
  const { caseId, comparisonId } = await params;
  const ctx = await requireOrganization();

  if (!can(ctx.role, "comparisons.view")) notFound();

  let comparison: Awaited<ReturnType<typeof comparisonService.getComparison>>;
  try {
    comparison = await comparisonService.getComparison(ctx, comparisonId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  if (comparison.caseId !== caseId) notFound();

  const canManage = can(ctx.role, "comparisons.manage");
  const { summary, scoreDeltas } = comparison;

  return (
    <div className="space-y-6">
      <CaseHeader creditCase={comparison.case} />

      <p className="text-sm text-text-secondary">
        <Link
          href={`/crm/casos/${caseId}/credito`}
          className="font-medium text-action-primary hover:text-action-secondary"
        >
          ← Evolución del crédito
        </Link>
      </p>

      <Card>
        <CardHeader
          title="Comparación de reportes"
          description={`${formatDate(comparison.baseReport.reportDate)} (${labelFor(CREDIT_REPORT_TYPE_LABELS, comparison.baseReport.type)}) → ${formatDate(comparison.compareReport.reportDate)} (${labelFor(CREDIT_REPORT_TYPE_LABELS, comparison.compareReport.type)})`}
        />

        <div className="grid gap-3 px-1 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Eliminados" value={summary.deleted} />
          <Stat label="Actualizados" value={summary.updated} />
          <Stat label="Sin cambio" value={summary.unchanged} />
          <Stat label="Nuevos" value={summary.new} />
        </div>
        {summary.verified > 0 ? (
          <p className="px-1 pb-3 text-sm text-text-secondary">
            Verificados (manual): {summary.verified}
          </p>
        ) : null}

        <div className="grid gap-3 border-t border-border-subtle px-1 py-4 sm:grid-cols-3">
          {scoreDeltas.map((row) => (
            <div
              key={row.bureau}
              className="rounded-control border border-border-subtle bg-surface-panel/60 px-4 py-3"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                {CREDIT_BUREAU_LABELS[row.bureau]}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {row.baseScore ?? "—"} → {row.compareScore ?? "—"}
              </p>
              <p className="mt-1 text-xl font-semibold">
                <Delta value={row.delta} />
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Detalle por cuenta"
          description="El resultado automático puede corregirse manualmente si el proveedor es inconsistente."
        />
        <Table>
          <THead>
            <TR>
              <TH>Acreedor</TH>
              <TH>Buró</TH>
              <TH>Cuenta</TH>
              <TH>Auto</TH>
              <TH>Resultado</TH>
            </TR>
          </THead>
          <TBody>
            {comparison.items.map((item) => (
              <TR key={item.id}>
                <TD className="font-medium text-ink">{item.creditorName}</TD>
                <TD>{CREDIT_BUREAU_LABELS[item.bureau]}</TD>
                <TD className="font-mono text-sm text-text-secondary">
                  {item.accountNumberMasked ?? "—"}
                </TD>
                <TD>
                  <Pill tone="slate">
                    {labelFor(COMPARISON_RESULT_LABELS, item.autoResult)}
                  </Pill>
                </TD>
                <TD>
                  {canManage ? (
                    <ComparisonResultOverride
                      itemId={item.id}
                      autoResult={item.autoResult}
                      manualResult={item.manualResult}
                    />
                  ) : (
                    <Pill tone="indigo">
                      {labelFor(COMPARISON_RESULT_LABELS, item.effectiveResult)}
                    </Pill>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control border border-border-subtle bg-surface-panel/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
