import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as creditReports from "@/src/server/credit-reports";
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
import { formatDate, formatMoney } from "@/src/lib/format";
import {
  CREDIT_BUREAU_LABELS,
  CREDIT_ITEM_LIFECYCLE_LABELS,
  CREDIT_NEGATIVE_TYPE_LABELS,
  CREDIT_REPORT_TYPE_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { AddCreditItemButton } from "@/src/components/credit-reports/add-item-button";
import { DeleteCreditItemButton } from "@/src/components/credit-reports/delete-item-button";
import { CaseHeader } from "../../../case-header";
import { List } from "lucide-react";

export const metadata: Metadata = {
  title: "Detalle de reporte",
};

export default async function CreditReportDetailPage({
  params,
}: {
  params: Promise<{ caseId: string; reportId: string }>;
}) {
  const { caseId, reportId } = await params;
  const ctx = await requireOrganization();

  if (!can(ctx.role, "creditReports.view")) {
    notFound();
  }

  let report: Awaited<ReturnType<typeof creditReports.getReportDetail>>;
  try {
    report = await creditReports.getReportDetail(ctx, reportId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  if (report.caseId !== caseId) notFound();

  const canManageItems = can(ctx.role, "creditItems.manage");
  const creditCase = report.case;

  return (
    <div className="space-y-6">
      <CaseHeader
        creditCase={creditCase}
        actions={
          canManageItems ? <AddCreditItemButton reportId={report.id} /> : null
        }
      />

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
          title={`Reporte · ${formatDate(report.reportDate)}`}
          description={[
            labelFor(CREDIT_REPORT_TYPE_LABELS, report.type),
            report.provider,
            report.externalReportId ? `ID ${report.externalReportId}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <div className="grid gap-3 px-1 pb-4 sm:grid-cols-3">
          {(["EXPERIAN", "EQUIFAX", "TRANSUNION"] as const).map((bureau) => {
            const snap = report.snapshots.find((s) => s.bureau === bureau);
            return (
              <div
                key={bureau}
                className="rounded-control border border-border-subtle bg-surface-panel/60 px-4 py-3"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {CREDIT_BUREAU_LABELS[bureau]}
                </p>
                <p className="mt-1 text-[28px] leading-8 font-semibold tracking-[-0.01em] tabular-nums text-ink">
                  {snap?.score ?? "—"}
                </p>
                {snap ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Negativos: {snap.negativeAccounts ?? "—"}
                    {snap.utilization != null
                      ? ` · Util. ${snap.utilization.toString()}%`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-text-placeholder">Sin snapshot</p>
                )}
              </div>
            );
          })}
        </div>
        {report.notes ? (
          <p className="border-t border-border-subtle px-1 py-3 text-sm text-text-secondary-strong whitespace-pre-wrap">
            {report.notes}
          </p>
        ) : null}
        {report.document ? (
          <p className="border-t border-border-subtle px-1 py-3 text-sm text-text-secondary">
            Documento vinculado:{" "}
            <span className="font-medium text-ink">
              {report.document.displayName ?? report.document.originalName}
            </span>
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Elementos"
          description={`${report.items.length} cuenta(s) en este reporte`}
        />
        {report.items.length === 0 ? (
          <EmptyState
            icon={List}
            title="Sin elementos"
            description="Añade cuentas negativas o cuentas a seguir desde este reporte."
            action={
              canManageItems ? <AddCreditItemButton reportId={report.id} /> : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Acreedor</TH>
                <TH>Buró</TH>
                <TH>Cuenta</TH>
                <TH>Saldo</TH>
                <TH>Negativo</TH>
                <TH>Estado</TH>
                {canManageItems ? <TH /> : null}
              </TR>
            </THead>
            <TBody>
              {report.items.map((item) => (
                <TR key={item.id}>
                  <TD>
                    <div className="font-medium text-ink">{item.creditorName}</div>
                    {item.accountStatus || item.paymentStatus ? (
                      <div className="text-xs text-text-secondary">
                        {[item.accountStatus, item.paymentStatus]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    ) : null}
                  </TD>
                  <TD>{CREDIT_BUREAU_LABELS[item.bureau]}</TD>
                  <TD className="font-mono text-sm text-text-secondary">
                    {item.accountNumberMasked ?? "—"}
                  </TD>
                  <TD className="tabular-nums">
                    {item.balance != null ? formatMoney(item.balance) : "—"}
                  </TD>
                  <TD>
                    {item.isNegative ? (
                      <Pill tone="red">
                        {item.negativeType
                          ? labelFor(CREDIT_NEGATIVE_TYPE_LABELS, item.negativeType)
                          : "Negativo"}
                      </Pill>
                    ) : (
                      <span className="text-text-placeholder">—</span>
                    )}
                  </TD>
                  <TD>
                    <Pill tone="slate">
                      {labelFor(CREDIT_ITEM_LIFECYCLE_LABELS, item.lifecycleStatus)}
                    </Pill>
                  </TD>
                  {canManageItems ? (
                    <TD className="text-right">
                      <DeleteCreditItemButton
                        itemId={item.id}
                        creditorName={item.creditorName}
                      />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
