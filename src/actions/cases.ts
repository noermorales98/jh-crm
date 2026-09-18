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
  if (clientId) {
    revalidatePath(`/crm/clientes/${clientId}`);
    revalidatePath(`/crm/clientes/${clientId}/servicios`);
    revalidatePath(`/crm/clientes/${clientId}/casos`);
  }
}

const createCaseSchema = z.object({
  clientId: cuidSchema,
  stageId: cuidSchema.optional(),
  assignedToId: cuidSchema.nullish(),
  summary: z.string().trim().max(5000).nullish(),
  nextActionAt: optionalDateSchema,
});

/** SC-001 — Crear expediente CREDIT_REPAIR (ServiceCase + CreditCase). */
export async function createCreditCase(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    caseCode: string;
    serviceCaseId: string;
    caseNumber: string;
  }>
> {
  try {
    const ctx = await requirePermission("cases.manage");
    const data = createCaseSchema.parse(input);
    const creditCase = await caseService.createCreditCase(ctx, data);
    revalidateCases(creditCase.clientId, creditCase.id);
    return actionOk({
      id: creditCase.id,
      caseCode: creditCase.caseCode,
      serviceCaseId: creditCase.serviceCaseId,
      caseNumber: creditCase.caseCode,
    });
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

const caseAmountsSchema = z.object({
  quotedAmount: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, "Monto inválido (máx. 2 decimales).")
    .nullish(),
  agreedAmount: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, "Monto inválido (máx. 2 decimales).")
    .nullish(),
});

/** PY-002 / Fase 4 — montos del expediente (balance a nivel ServiceCase). */
export async function updateCaseAmounts(
  caseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(caseId);
    const data = caseAmountsSchema.parse(input);
    const updated = await caseService.updateCaseAmounts(ctx, id, {
      quotedAmount:
        data.quotedAmount === undefined ? undefined : data.quotedAmount || null,
      agreedAmount:
        data.agreedAmount === undefined ? undefined : data.agreedAmount || null,
    });
    revalidateCases(updated.clientId, updated.id);
    revalidatePath(`/crm/casos/${updated.id}/pagos`);
    return actionOk({ id: updated.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function moveCaseToStage(
  caseId: string,
  stageId: string,
): Promise<ActionResult<{ id: string; suggestedTaskId?: string | null }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(caseId);
    const stage = cuidSchema.parse(stageId);
    const creditCase = await caseService.moveCaseToStage(ctx, id, stage);
    revalidateCases(creditCase.clientId, creditCase.id);
    revalidatePath("/crm/tareas");
    if (creditCase.suggestedTaskId) {
      revalidatePath(`/crm/tareas/${creditCase.suggestedTaskId}`);
    }
    return actionOk({
      id: creditCase.id,
      suggestedTaskId: creditCase.suggestedTaskId ?? null,
    });
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

const nextActionSchema = z.object({ nextActionAt: optionalDateSchema });

export async function setNextActionAt(
  caseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(caseId);
    const { nextActionAt } = nextActionSchema.parse(input);
    const updated = await caseService.setNextActionAt(ctx, id, nextActionAt ?? null);
    revalidateCases(updated.clientId, updated.id);
    return actionOk({ id: updated.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
