import type { Metadata } from "next";
import Link from "next/link";
import { FileBarChart2 } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { listAgencyReports } from "@/src/server/agency-reports";
import {
  firstParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  Card,
  EmptyState,
  FilterBar,
  FilterSelect,
  ListToolbar,
  PageHeader,
  Pill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { CREDIT_REPORT_TYPE_LABELS, labelFor } from "@/src/lib/labels";
import {
  REPORTES_KIND_CREDIT,
  REPORTES_KIND_LABELS,
  REPORTES_KIND_PROGRESS,
  REPORTES_PAGE_DESCRIPTION,
  REPORTES_PAGE_TITLE,
  parseReportesKind,
} from "@/src/lib/reports/agency-reportes";

export const metadata: Metadata = {
  title: REPORTES_PAGE_TITLE,
};

const KIND_OPTIONS = [
  {
    value: REPORTES_KIND_CREDIT,
    label: REPORTES_KIND_LABELS[REPORTES_KIND_CREDIT],
  },
  {
    value: REPORTES_KIND_PROGRESS,
    label: REPORTES_KIND_LABELS[REPORTES_KIND_PROGRESS],
  },
];

export default async function AgencyReportesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;
  const kind = parseReportesKind(firstParam(sp, "kind"));

  if (!can(ctx.role, "creditReports.view") && !can(ctx.role, "cases.view")) {
    return (
      <div>
        <PageHeader
          title={REPORTES_PAGE_TITLE}
          description={REPORTES_PAGE_DESCRIPTION}
        />
        <Card>
          <EmptyState
            icon={FileBarChart2}
            title="Sin acceso"
            description="No tienes permiso para ver reportes de la organización."
          />
        </Card>
      </div>
    );
  }

  const { items } = await listAgencyReports(ctx, { kind });

  return (
    <div>
      <PageHeader
        title={REPORTES_PAGE_TITLE}
        description={REPORTES_PAGE_DESCRIPTION}
      />

      <ListToolbar
        filters={
          <FilterBar>
            <FilterSelect name="kind" label="Tipo" options={KIND_OPTIONS} />
          </FilterBar>
        }
      />

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={FileBarChart2}
            title="Sin reportes"
            description="Cuando importes un PDF de buró o generes un reporte de progreso, aparecerán aquí."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Tipo</TH>
                <TH>Cliente / caso</TH>
                <TH>Detalle</TH>
                <TH>Fecha</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={`${row.kind}-${row.id}`} className="hover:bg-nav-hover">
                  <TD>
                    {row.kind === "credit" ? (
                      <Pill tone="blue">Crédito</Pill>
                    ) : (
                      <Pill tone="indigo">Progreso</Pill>
                    )}
                  </TD>
                  <TD>
                    <Link
                      href={row.href}
                      className="font-medium text-action-primary hover:underline"
                    >
                      {row.kind === "credit"
                        ? `${row.clientName} (${row.clientCode})`
                        : row.clientName}
                    </Link>
                    <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
                      {row.caseCode}
                    </p>
                  </TD>
                  <TD className="text-text-secondary">
                    {row.kind === "credit" ? (
                      <>
                        {labelFor(CREDIT_REPORT_TYPE_LABELS, row.type)}
                        <span className="text-text-secondary">
                          {" "}
                          · {row.snapshotCount} buró
                          {row.snapshotCount === 1 ? "" : "s"} · {row.itemCount}{" "}
                          ítem
                          {row.itemCount === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : (
                      <>
                        {row.periodLabel}
                        {row.roundLabel ? ` · ${row.roundLabel}` : null}
                      </>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap tabular-nums text-text-secondary">
                    {formatDate(row.reportDate)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
