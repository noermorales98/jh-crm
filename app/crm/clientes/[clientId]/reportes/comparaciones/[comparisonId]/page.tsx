import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import ComparisonDetailView from "../../../_vistas-caso/comparaciones/[comparisonId]/page";

export const metadata: Metadata = {
  title: "Comparación de reportes",
};

/** Comparación entre dos reportes (sin id de caso en la URL). */
export default async function ClientComparisonPage({
  params,
}: {
  params: Promise<{ clientId: string; comparisonId: string }>;
}) {
  const { clientId, comparisonId } = await params;
  const ctx = await requireOrganization();
  const comparison = await prisma.reportComparison.findFirst({
    where: { id: comparisonId, organizationId: ctx.organizationId },
    select: { caseId: true, case: { select: { clientId: true } } },
  });
  if (!comparison) notFound();
  if (comparison.case.clientId !== clientId) {
    redirect(`/crm/clientes/${comparison.case.clientId}/reportes/comparaciones/${comparisonId}`);
  }
  return (
    <ComparisonDetailView
      params={Promise.resolve({ clientId, caseId: comparison.caseId, comparisonId })}
    />
  );
}
