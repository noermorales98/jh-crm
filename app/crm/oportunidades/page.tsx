import type { Metadata } from "next";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as opportunities from "@/src/server/opportunities";
import * as clientService from "@/src/server/clients";
import { listMemberOptions, clientFullName } from "@/src/server/page-helpers";
import { listVerticalServiceOptions } from "@/src/server/services/verticals";
import { PageHeader } from "@/src/components/ui";
import { OpportunityKanban } from "@/src/components/opportunities/opportunity-kanban";
import { CreateLeadButton } from "@/src/components/opportunities/create-lead-button";
import { CreateOpportunityButton } from "@/src/components/opportunities/create-opportunity-button";

export const metadata: Metadata = {
  title: "Leads",
};

/**
 * LD-003 — Pipeline de Leads (UI sobre Opportunity; sin tabla Lead).
 * Siempre fresco tras crear/editar leads (router.refresh + revalidatePath).
 */
export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const ctx = await requirePermission("opportunities.view");
  const canManage = can(ctx.role, "opportunities.manage");
  const canCreateLead =
    canManage && can(ctx.role, "clients.create");
  const canEditLead = canManage && can(ctx.role, "clients.edit");

  const [columns, clientsResult, members, verticalServices] = await Promise.all([
    opportunities.listByStage(ctx),
    clientService.listClients(ctx, { limit: 100 }),
    listMemberOptions(ctx),
    listVerticalServiceOptions(ctx.organizationId),
  ]);

  const clientOptions = clientsResult.items
    .filter((c) => c.status !== "ARCHIVED")
    .map((c) => ({
      id: c.id,
      label: `${clientFullName(c)} (${c.clientCode})`,
    }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        description="Tarjetas por etapa. Haz clic en un lead para ver origen, intención y mensajes del formulario."
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <CreateLeadButton
                members={members}
                canCreate={canCreateLead}
              />
              <CreateOpportunityButton clients={clientOptions} />
            </div>
          ) : undefined
        }
      />
      <OpportunityKanban
        columns={columns}
        canManage={canManage}
        canEditLead={canEditLead}
        members={members}
        services={verticalServices.map((s) => ({
          code: s.code,
          name: s.name,
        }))}
      />
    </div>
  );
}
