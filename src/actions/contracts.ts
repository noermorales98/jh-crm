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
  createContractSchema,
  signContractSchema,
  upsertContractTemplateSchema,
} from "@/src/lib/validation/contracts";
import * as contracts from "@/src/server/contracts";

function revalidateContracts(clientId?: string) {
  revalidatePath("/crm/contratos");
  if (clientId) {
    revalidatePath(`/crm/clientes/${clientId}`);
  }
}

export async function upsertContractTemplateAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("contracts.manage");
    const data = upsertContractTemplateSchema.parse(input);
    const template = await contracts.upsertTemplate(ctx, data);
    revalidateContracts();
    return actionOk({ id: template.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function createContractAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("contracts.manage");
    const data = createContractSchema.parse(input);
    const contract = await contracts.createContractFromTemplate(ctx, data);
    revalidateContracts(data.clientId);
    return actionOk({ id: contract.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function markContractSentAction(
  contractId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("contracts.manage");
    const id = cuidSchema.parse(contractId);
    const contract = await contracts.markSent(ctx, id);
    revalidateContracts(contract.clientId);
    return actionOk({ id: contract.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function cancelContractAction(
  contractId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("contracts.manage");
    const id = cuidSchema.parse(contractId);
    const contract = await contracts.cancelContract(ctx, id);
    revalidateContracts(contract.clientId);
    return actionOk({ id: contract.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function signContractAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("contracts.manage");
    const data = signContractSchema.parse(input);
    const contract = await contracts.signContract(ctx, data);
    revalidateContracts(contract.clientId);
    return actionOk({ id: contract.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
