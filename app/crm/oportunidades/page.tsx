import type { Metadata } from "next";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { prisma } from "@/src/lib/db";
import * as opportunities from "@/src/server/opportunities";
import { PageHeader } from "@/src/components/ui";
import { CreateOpportunityButton } from "@/src/components/opportunities/create-opportunity-button";
import { OpportunityKanban } from "@/src/components/opportunities/opportunity-kanban";

export const metadata: Metadata = {
  title: "Oportunidades",
};

export default async function OpportunitiesPage() {
  const ctx = await requirePermission("opportunities.view");
  const canManage = can(ctx.role, "opportunities.manage");
  const columns = await opportunities.listByStage(ctx);

  const leadClients = canManage
    ? await prisma.client.findMany({
        where: {
          organizationId: ctx.organizationId,
          archivedAt: null,
          status: { in: ["LEAD", "ACTIVE"] },
        },
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
          status: true,
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 200,
      })
    : [];

  const clientOptions = leadClients.map((c) => ({
    id: c.id,
    label: `${c.clientCode} · ${[c.firstName, c.lastName].filter(Boolean).join(" ")} (${c.status === "LEAD" ? "Prospecto" : "Activo"})`,
  }));

  return (
    <div>
      <PageHeader
        title="Oportunidades"
        description="Pipeline comercial. Al marcar ganada se crea el caso de crédito y el cliente pasa a activo."
        actions={
          canManage ? (
            <CreateOpportunityButton clients={clientOptions} />
          ) : null
        }
      />
      <OpportunityKanban columns={columns} canManage={canManage} />
    </div>
  );
}
