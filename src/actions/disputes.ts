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
  addDisputeItemSchema,
  addDisputeItemsBulkSchema,
  updateDisputeItemSchema,
} from "@/src/lib/validation/disputes";
import * as disputeService from "@/src/server/disputes";

function revalidateDisputes(caseId: string, roundId: string) {
  revalidatePath(`/crm/casos/${caseId}`);
  revalidatePath(`/crm/casos/${caseId}/rondas`);
  revalidatePath(`/crm/casos/${caseId}/rondas/${roundId}`);
  revalidatePath("/crm/rondas");
}

export async function addDisputeItem(
  input: unknown,
): Promise<ActionResult<{ id: string; roundId: string }>> {
  try {
    const ctx = await requirePermission("disputes.manage");
    const data = addDisputeItemSchema.parse(input);
    const item = await disputeService.addDisputeItem(ctx, data);
    const round = await disputeService.getRoundDetail(ctx, item.roundId);
    revalidateDisputes(round.round.caseId, item.roundId);
    return actionOk({ id: item.id, roundId: item.roundId });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function addDisputeItemsBulk(
  input: unknown,
): Promise<ActionResult<{ count: number; roundId: string }>> {
  try {
    const ctx = await requirePermission("disputes.manage");
    const data = addDisputeItemsBulkSchema.parse(input);
    const items = await disputeService.addDisputeItemsBulk(ctx, data);
    const round = await disputeService.getRoundDetail(ctx, data.roundId);
    revalidateDisputes(round.round.caseId, data.roundId);
    return actionOk({ count: items.length, roundId: data.roundId });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateDisputeItem(
  disputeItemId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("disputes.manage");
    const id = cuidSchema.parse(disputeItemId);
    const data = updateDisputeItemSchema.parse(input);
    const item = await disputeService.updateDisputeItem(ctx, id, data);
    const round = await disputeService.getRoundDetail(ctx, item.roundId);
    revalidateDisputes(round.round.caseId, item.roundId);
    return actionOk({ id: item.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function cancelDisputeItem(
  disputeItemId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("disputes.manage");
    const id = cuidSchema.parse(disputeItemId);
    const item = await disputeService.cancelDisputeItem(ctx, id);
    const round = await disputeService.getRoundDetail(ctx, item.roundId);
    revalidateDisputes(round.round.caseId, item.roundId);
    return actionOk({ id: item.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
