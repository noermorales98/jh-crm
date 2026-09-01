"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema, optionalDateSchema } from "@/src/lib/validation/common";
import * as caseService from "@/src/server/cases";

function revalidateCases(clientId?: string, caseId?: string) {
  revalidatePath("/crm/casos");
  revalidatePath("/crm/dashboard");
  if (caseId) revalidatePath(`/crm/casos/${caseId}`);
  if (clientId) revalidatePath(`/crm/clientes/${clientId}`);
}

const createCaseSchema = z.object({
  clientId: cuidSchema,
  stageId: cuidSchema.optional(),
  assignedToId: cuidSchema.nullish(),
  summary: z.string().trim().max(5000).nullish(),
  nextReviewAt: optionalDateSchema,
});

export async function createCreditCase(
  input: unknown,
): Promise<ActionResult<{ id: string; caseCode: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const data = createCaseSchema.parse(input);
    const creditCase = await caseService.createCreditCase(ctx, data);
    revalidateCases(creditCase.clientId, creditCase.id);
    return actionOk({ id: creditCase.id, caseCode: creditCase.caseCode });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const updateCaseSchema = z.object({
  assignedToId: cuidSchema.nullish(),
  summary: z.string().trim().max(5000).nullish(),
});

export async function updateCreditCase(
  caseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(caseId);
    const data = updateCaseSchema.parse(input);
    const creditCase = await caseService.updateCreditCase(ctx, id, data);
    revalidateCases(creditCase.clientId, creditCase.id);
    return actionOk({ id: creditCase.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function moveCaseToStage(
  caseId: string,
  stageId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(caseId);
    const stage = cuidSchema.parse(stageId);
    const creditCase = await caseService.moveCaseToStage(ctx, id, stage);
    revalidateCases(creditCase.clientId, creditCase.id);
    return actionOk({ id: creditCase.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

async function transition(
  caseId: string,
  fn: typeof caseService.pauseCase,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(caseId);
    const creditCase = await fn(ctx, id);
    revalidateCases(creditCase.clientId, creditCase.id);
    return actionOk({ id: creditCase.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function pauseCase(caseId: string) {
  return transition(caseId, caseService.pauseCase);
}

export async function completeCase(caseId: string) {
  return transition(caseId, caseService.completeCase);
}

export async function reopenCase(caseId: string) {
  return transition(caseId, caseService.reopenCase);
}

const nextReviewSchema = z.object({ nextReviewAt: optionalDateSchema });

export async function setNextReviewDate(
  caseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(caseId);
    const { nextReviewAt } = nextReviewSchema.parse(input);
    const creditCase = await caseService.setNextReviewDate(ctx, id, nextReviewAt ?? null);
    revalidateCases(creditCase.clientId, creditCase.id);
    return actionOk({ id: creditCase.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
