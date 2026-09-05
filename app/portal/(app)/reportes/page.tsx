import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  EmptyState,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { requirePortalSession } from "@/src/server/auth/guards";
import * as portal from "@/src/server/portal";
import { formatDate } from "@/src/lib/format";
import { FileText } from "lucide-react";

export const metadata: Metadata = { title: "Reportes" };

export default async function PortalReportesPage() {
  const ctx = await requirePortalSession();
  const reports = await portal.listPortalProgressReports(
    ctx.clientId,
    ctx.organizationId,
  );

  return (
    <div>
      <PageHeader
        title="Reportes de progreso"
        description="Informes generados por tu asesor sobre el avance del caso."
      />
      <Card>
        {reports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Sin reportes"
            description="Los reportes de progreso aparecerán cuando tu asesor los genere."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Caso</TH>
                <TH>Periodo</TH>
                <TH>Ronda</TH>
                <TH>Fecha</TH>
                <TH>Próxima revisión</TH>
                <TH>Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {reports.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.caseCode}</TD>
                  <TD>{r.periodLabel}</TD>
                  <TD>{r.roundLabel}</TD>
                  <TD>{formatDate(r.reportDate)}</TD>
                  <TD>
                    {r.nextReviewAt ? formatDate(r.nextReviewAt) : "—"}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <Link
                        href={`/portal/reportes/${r.id}`}
                        className="font-medium text-action-primary hover:underline"
                      >
                        Ver
                      </Link>
                      <a
                        href={`/api/progress-reports/${r.id}/pdf`}
                        className="font-medium text-action-primary hover:underline"
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
    </div>
  );
}
