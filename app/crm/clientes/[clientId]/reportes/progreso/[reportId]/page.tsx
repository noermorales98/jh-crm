import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import ProgressReportView from "../../../_vistas-caso/reportes/[reportId]/page";

export const metadata: Metadata = {
  title: "Reporte de progreso",
};

/** Reporte de progreso para el cliente (sin id de caso en la URL). */
export default async function ClientProgressReportPage({
  params,
}: {
  params: Promise<{ clientId: string; reportId: string }>;
}) {
  const { clientId, reportId } = await params;
  const ctx = await requireOrganization();
  const report = await prisma.clientProgressReport.findFirst({
    where: { id: reportId, organizationId: ctx.organizationId },
    select: { caseId: true, case: { select: { clientId: true } } },
  });
  if (!report) notFound();
  if (report.case.clientId !== clientId) {
    redirect(`/crm/clientes/${report.case.clientId}/reportes/progreso/${reportId}`);
  }
  return (
    <ProgressReportView params={Promise.resolve({ clientId, caseId: report.caseId, reportId })} />
  );
}
