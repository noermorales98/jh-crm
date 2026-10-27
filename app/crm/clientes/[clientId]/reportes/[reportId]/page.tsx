import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import CreditReportDetailView from "../../_vistas-caso/credito/reportes/[reportId]/page";

export const metadata: Metadata = {
  title: "Cuentas del reporte",
};

/** Detalle de cuentas de un reporte (sin id de caso en la URL). */
export default async function ClientReportPage({
  params,
}: {
  params: Promise<{ clientId: string; reportId: string }>;
}) {
  const { clientId, reportId } = await params;
  const ctx = await requireOrganization();
  const report = await prisma.creditReport.findFirst({
    where: { id: reportId, organizationId: ctx.organizationId },
    select: { clientId: true, caseId: true },
  });
  if (!report) notFound();
  if (report.clientId !== clientId) {
    redirect(`/crm/clientes/${report.clientId}/reportes/${reportId}`);
  }
  return (
    <CreditReportDetailView
      params={Promise.resolve({ clientId, caseId: report.caseId, reportId })}
    />
  );
}
