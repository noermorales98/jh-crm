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
  linkProcessorAccountSchema,
  processorCreateSchema,
  processorUpdateSchema,
  updateProcessorAccountSchema,
} from "@/src/lib/validation/processors";
import * as processors from "@/src/server/processors";

function revalidateProcessors(clientId?: string) {
  revalidatePath("/crm/procesadores");
  if (clientId) {
    revalidatePath(`/crm/clientes/${clientId}`);
    revalidatePath(`/crm/clientes/${clientId}/expediente`);
  }
}

export async function createProcessorAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("processors.manage");
    const data = processorCreateSchema.parse(input);
    const processor = await processors.createProcessor(ctx, {
      ...data,
      websiteUrl: data.websiteUrl || null,
      affiliateUrl: data.affiliateUrl || null,
      instructions: data.instructions || null,
    });
    revalidateProcessors();
    return actionOk({ id: processor.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateProcessorAction(
  processorId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("processors.manage");
    const id = cuidSchema.parse(processorId);
    const data = processorUpdateSchema.parse(input);
    const processor = await processors.updateProcessor(ctx, id, {
      ...data,
      websiteUrl: data.websiteUrl === "" ? null : data.websiteUrl,
      affiliateUrl: data.affiliateUrl === "" ? null : data.affiliateUrl,
      instructions: data.instructions === "" ? null : data.instructions,
    });
    revalidateProcessors();
    return actionOk({ id: processor.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function linkProcessorAccountAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("processors.manage");
    const data = linkProcessorAccountSchema.parse(input);
    const account = await processors.linkAccount(ctx, {
      ...data,
      externalMemberId: data.externalMemberId || null,
      externalUrl: data.externalUrl || null,
      notes: data.notes || null,
    });
    revalidateProcessors(data.clientId);
    return actionOk({ id: account.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateProcessorAccountAction(
  accountId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("processors.manage");
    const id = cuidSchema.parse(accountId);
    const data = updateProcessorAccountSchema.parse(input);
    const account = await processors.updateAccount(ctx, id, {
      ...data,
      externalMemberId: data.externalMemberId === "" ? null : data.externalMemberId,
      externalUrl: data.externalUrl === "" ? null : data.externalUrl,
      notes: data.notes === "" ? null : data.notes,
    });
    revalidateProcessors(account.clientId);
    return actionOk({ id: account.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
