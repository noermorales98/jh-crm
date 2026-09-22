"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, ForbiddenError } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  opportunityCreateSchema,
  leadCreateSchema,
  leadUpdateSchema,
  opportunityMarkLostSchema,
  opportunityMarkWonSchema,
  opportunityUpdateStageSchema,
} from "@/src/lib/validation/opportunities";
import * as opportunities from "@/src/server/opportunities";

function revalidateOpportunities(clientId?: string, caseId?: string) {
  revalidatePath("/crm/oportunidades", "layout");
  revalidatePath("/crm/oportunidades", "page");
  revalidatePath("/crm/clientes");
  revalidatePath("/crm/dashboard");
  if (clientId) {
    revalidatePath(`/crm/clientes/${clientId}`);
    revalidatePath(`/crm/clientes/${clientId}/casos`);
    revalidatePath(`/crm/clientes/${clientId}/servicios`);
  }
  if (caseId) {
    revalidatePath(`/crm/casos/${caseId}`);
    revalidatePath("/crm/casos");
  }
}

export async function createLeadAction(
  input: unknown,
): Promise<ActionResult<{ opportunityId: string; clientId: string }>> {
  try {
    const ctx = await requirePermission("opportunities.manage");
    if (!can(ctx.role, "clients.create")) {
      throw new ForbiddenError(
        "Necesitas permiso para crear clientes además de oportunidades.",
      );
    }
    const data = leadCreateSchema.parse(input);
    const result = await opportunities.createLead(ctx, {
      firstName: data.firstName,
      lastName: data.lastName || null,
      email: data.email || null,
      phone: data.phone || null,
      source: data.source || null,
      leadChannel: data.leadChannel ?? null,
      serviceRequested: data.serviceRequested || null,
      ownerId: data.ownerId ?? null,
      estimatedValue: data.estimatedValue ?? null,
      campaign: data.campaign || null,
      nextFollowUpAt: data.nextFollowUpAt ?? null,
    });
    revalidateOpportunities(result.client.id);
    return actionOk({
      opportunityId: result.opportunity.id,
      clientId: result.client.id,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateLeadAction(
  input: unknown,
): Promise<ActionResult<{ opportunityId: string; clientId: string }>> {
  try {
    const ctx = await requirePermission("opportunities.manage");
    if (!can(ctx.role, "clients.edit")) {
      throw new ForbiddenError(
        "Necesitas permiso para editar clientes además de oportunidades.",
      );
    }
    const data = leadUpdateSchema.parse(input);
    const result = await opportunities.updateLead(ctx, data.opportunityId, {
      firstName: data.firstName,
      lastName: data.lastName || null,
      email: data.email || null,
      phone: data.phone || null,
      source: data.source || null,
      leadChannel: data.leadChannel ?? null,
      serviceRequested: data.serviceRequested || null,
      ownerId: data.ownerId ?? null,
      estimatedValue: data.estimatedValue ?? null,
      campaign: data.campaign || null,
      nextFollowUpAt: data.nextFollowUpAt ?? null,
    });

    revalidateOpportunities(result.client.id);
    revalidatePath("/crm/dashboard");
    return actionOk({
      opportunityId: result.opportunity.id,
      clientId: result.client.id,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function createOpportunityAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("opportunities.manage");
    const data = opportunityCreateSchema.parse(input);
    const opp = await opportunities.createOpportunity(ctx, {
      ...data,
      source: data.source || null,
      campaign: data.campaign || null,
    });
    revalidateOpportunities(data.clientId);
    return actionOk({ id: opp.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateOpportunityStageAction(
  opportunityId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("opportunities.manage");
    const id = cuidSchema.parse(opportunityId);
    const { stage } = opportunityUpdateStageSchema.parse(input);
    const opp = await opportunities.updateStage(ctx, id, stage);
    revalidateOpportunities(opp.clientId);
    return actionOk({ id: opp.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function markOpportunityWonAction(
  opportunityId: string,
  input?: unknown,
): Promise<
  ActionResult<{
    id: string;
    caseId: string | null;
    serviceCaseId: string | null;
    caseCode: string | null;
  }>
> {
  try {
    const ctx = await requirePermission("opportunities.manage");
    const id = cuidSchema.parse(opportunityId);
    const data = opportunityMarkWonSchema.parse(input ?? {});
    const opp = await opportunities.markWon(ctx, id, {
      serviceCode: data.serviceCode,
    });
    // Fase 4: el enlace canónico es wonServiceCase; wonCase es legacy.
    const wonCreditCase = opp.wonCase ?? opp.wonServiceCase?.creditCase ?? null;
    revalidateOpportunities(opp.clientId, wonCreditCase?.id ?? undefined);
    if (opp.wonServiceCaseId) {
      revalidatePath(`/crm/expedientes/${opp.wonServiceCaseId}`);
      revalidatePath(`/crm/clientes/${opp.clientId}/servicios`);
    }
    return actionOk({
      id: opp.id,
      caseId: wonCreditCase?.id ?? null,
      serviceCaseId: opp.wonServiceCaseId,
      caseCode:
        wonCreditCase?.caseCode ??
        opp.wonServiceCase?.caseNumber ??
        null,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function markOpportunityLostAction(
  opportunityId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("opportunities.manage");
    const id = cuidSchema.parse(opportunityId);
    const { lostReason } = opportunityMarkLostSchema.parse(input);
    const opp = await opportunities.markLost(ctx, id, lostReason);
    revalidateOpportunities(opp.clientId);
    return actionOk({ id: opp.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
