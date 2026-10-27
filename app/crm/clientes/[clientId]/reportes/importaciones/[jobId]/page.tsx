import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import CreditPdfImportJobView from "../../../_vistas-caso/credito/importaciones/[jobId]/page";

export const metadata: Metadata = {
  title: "Analizando PDF",
};

/** Progreso del análisis de un PDF (sin id de caso en la URL). */
export default async function ClientImportJobPage({
  params,
}: {
  params: Promise<{ clientId: string; jobId: string }>;
}) {
  const { clientId, jobId } = await params;
  const ctx = await requireOrganization();
  const job = await prisma.creditPdfImportJob.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    select: { clientId: true, caseId: true },
  });
  if (!job) notFound();
  if (job.clientId !== clientId) {
    redirect(`/crm/clientes/${job.clientId}/reportes/importaciones/${jobId}`);
  }
  return <CreditPdfImportJobView params={Promise.resolve({ caseId: job.caseId, jobId })} />;
}
