import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { DomainError } from "@/src/server/errors";
import { firstParam, type SearchParams } from "@/src/server/page-helpers";
import { getClientActionPlan } from "@/src/server/credit-reports/action-plan";
import { ClientActionPlanView } from "@/src/components/clients/client-action-plan-view";
import { prisma } from "@/src/lib/db";

export const metadata: Metadata = {
  title: "Plan de Acción",
};

export default async function ClientActionPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: SearchParams;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const reportId = firstParam(sp, "reportId");
  const ctx = await requireOrganization();

  if (!can(ctx.role, "creditReports.view")) {
    notFound();
  }

  const org = await prisma.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { name: true },
  });

  let plan: Awaited<ReturnType<typeof getClientActionPlan>>;
  try {
    plan = await getClientActionPlan(ctx, clientId, reportId);
  } catch (error) {
    if (error instanceof DomainError) {
      return (
        <div className="mx-auto max-w-lg space-y-3 px-4 py-10 text-center">
          <p className="text-[16px] font-semibold text-ink">
            Sin plan disponible
          </p>
          <p className="text-[13px] text-text-secondary">{error.message}</p>
          <Link
            href={`/crm/clientes/${clientId}`}
            className="inline-flex text-sm font-medium text-action-primary"
          >
            ← Volver al cliente
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
    />
  );
}
