import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { DomainError } from "@/src/server/errors";
import { getClientActionPlan } from "@/src/server/credit-reports/action-plan";
import { ClientActionPlanView } from "@/src/components/clients/client-action-plan-view";
import { prisma } from "@/src/lib/db";
import { caseHref } from "@/src/lib/routes/case-routes";

export const metadata: Metadata = {
  title: "Análisis de Crédito",
};

/** Análisis de Crédito y Plan de Acción de un reporte importado. */
export default async function CreditAnalysisPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const ctx = await requireOrganization();
  if (!can(ctx.role, "creditReports.view")) notFound();

  const report = await prisma.creditReport.findFirst({
    where: { id: reportId, organizationId: ctx.organizationId },
    select: { clientId: true, caseId: true },
  });
  if (!report) notFound();

  const org = await prisma.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { name: true },
  });

  let plan: Awaited<ReturnType<typeof getClientActionPlan>>;
  try {
    plan = await getClientActionPlan(ctx, report.clientId, reportId);
  } catch (error) {
    if (error instanceof DomainError) {
      return (
        <div className="mx-auto max-w-lg space-y-3 px-4 py-10 text-center">
          <p className="text-[16px] font-semibold text-ink">Sin análisis disponible</p>
          <p className="text-[13px] text-text-secondary">{error.message}</p>
          <Link
            href="/crm/reportes"
            className="inline-flex text-sm font-medium text-action-primary"
          >
            ← Volver a reportes
          </Link>
        </div>
      );
    }
    throw error;
  }

  return (
    <ClientActionPlanView
      plan={plan}
      organizationName={org?.name ?? "Agencia"}
      backHref="/crm/reportes"
      backLabel="Volver a reportes"
      accountsHref={caseHref(
        report.clientId,
        report.caseId,
        `/credito/reportes/${reportId}`,
      )}
    />
  );
}
