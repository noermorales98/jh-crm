"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  opportunityCreateSchema,
  opportunityMarkLostSchema,
  opportunityUpdateStageSchema,
} from "@/src/lib/validation/opportunities";
import * as opportunities from "@/src/server/opportunities";

function revalidateOpportunities(clientId?: string, caseId?: string) {
  revalidatePath("/crm/oportunidades");
  if (clientId) {
    revalidatePath(`/crm/clientes/${clientId}`);
    revalidatePath(`/crm/clientes/${clientId}/casos`);
  }
  if (caseId) {
    revalidatePath(`/crm/casos/${caseId}`);
    revalidatePath("/crm/casos");
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
): Promise<ActionResult<{ id: string; caseId: string | null }>> {
  try {
    const ctx = await requirePermission("opportunities.manage");
    const id = cuidSchema.parse(opportunityId);
    const opp = await opportunities.markWon(ctx, id);
    revalidateOpportunities(opp.clientId, opp.wonCaseId ?? undefined);
    return actionOk({ id: opp.id, caseId: opp.wonCaseId });
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
