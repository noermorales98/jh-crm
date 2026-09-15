"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  DomainError,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema, optionalDateSchema } from "@/src/lib/validation/common";
import { isServiceCode } from "@/src/server/services/codes";
import * as caseService from "@/src/server/cases";
import * as serviceCaseService from "@/src/server/service-cases";
import { createServiceCaseNote } from "@/src/server/notes";

function revalidateServiceCase(
  serviceCaseId: string,
  clientId?: string,
  caseId?: string | null,
) {
  revalidatePath(`/crm/expedientes/${serviceCaseId}`);
  revalidatePath("/crm/casos");
  revalidatePath("/crm/dashboard");
  if (caseId) revalidatePath(`/crm/casos/${caseId}`);
  if (clientId) {
    revalidatePath(`/crm/clientes/${clientId}`);
    revalidatePath(`/crm/clientes/${clientId}/servicios`);
    revalidatePath(`/crm/clientes/${clientId}/casos`);
  }
}

const createServiceCaseSchema = z.object({
  clientId: cuidSchema,
  serviceCode: z.string().trim().min(1),
  stageId: cuidSchema.optional(),
  assignedToId: cuidSchema.nullish(),
  summary: z.string().trim().max(5000).nullish(),
  nextActionAt: optionalDateSchema,
});

/**
 * Fase 5 — Crear expediente de cualquier vertical.
 * Devuelve `href`: ficha de crédito si hay CreditCase, ficha genérica si no.
 */
export async function createServiceCaseAction(
  input: unknown,
): Promise<
  ActionResult<{
    serviceCaseId: string;
    caseId: string | null;
    caseNumber: string;
    href: string;
  }>
> {
  try {
    const ctx = await requirePermission("cases.manage");
    const data = createServiceCaseSchema.parse(input);
    if (!isServiceCode(data.serviceCode)) {
      throw new DomainError("Código de servicio inválido.");
    }
    const { serviceCase, creditCase } = await caseService.createServiceCase(
      ctx,
      { ...data, serviceCode: data.serviceCode },
    );
    revalidateServiceCase(serviceCase.id, serviceCase.clientId, creditCase?.id);
    return actionOk({
      serviceCaseId: serviceCase.id,
      caseId: creditCase?.id ?? null,
      caseNumber: serviceCase.caseNumber,
      href: creditCase
        ? `/crm/casos/${creditCase.id}`
        : `/crm/expedientes/${serviceCase.id}`,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function moveServiceCaseStageAction(
  serviceCaseId: string,
  stageId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(serviceCaseId);
    const stage = cuidSchema.parse(stageId);
    const updated = await serviceCaseService.moveServiceCaseToStage(
      ctx,
      id,
      stage,
    );
    revalidateServiceCase(id, updated.clientId);
    return actionOk({ id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const nextActionSchema = z.object({ nextActionAt: optionalDateSchema });

export async function setServiceCaseNextActionAction(
  serviceCaseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(serviceCaseId);
    const { nextActionAt } = nextActionSchema.parse(input);
    const updated = await serviceCaseService.setServiceCaseNextActionAt(
      ctx,
      id,
      nextActionAt ?? null,
    );
    revalidateServiceCase(id, updated.clientId);
    return actionOk({ id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const transitionSchema = z.enum(["OPEN", "ON_HOLD", "COMPLETED", "CANCELED"]);

export async function transitionServiceCaseAction(
  serviceCaseId: string,
  target: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(serviceCaseId);
    const status = transitionSchema.parse(target);
    const updated = await serviceCaseService.transitionServiceCase(
      ctx,
      id,
      status,
    );
    revalidateServiceCase(id, updated.clientId);
    return actionOk({ id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const amountsSchema = z.object({
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

/** PY-002 / Fase 5 — montos del expediente por serviceCaseId. */
export async function updateServiceCaseAmountsAction(
  serviceCaseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(serviceCaseId);
    const data = amountsSchema.parse(input);
    await serviceCaseService.updateServiceCaseAmounts(ctx, id, {
      quotedAmount:
        data.quotedAmount === undefined ? undefined : data.quotedAmount || null,
      agreedAmount:
        data.agreedAmount === undefined ? undefined : data.agreedAmount || null,
    });
    revalidateServiceCase(id);
    return actionOk({ id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const noteSchema = z.object({
  serviceCaseId: cuidSchema,
  body: z.string().trim().min(1, "Escribe una nota.").max(5000),
});

/** NT-001 / Fase 5 — nota en expediente por serviceCaseId directo. */
export async function addServiceCaseNoteByIdAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const data = noteSchema.parse(input);
    const note = await createServiceCaseNote(ctx, {
      serviceCaseId: data.serviceCaseId,
      body: data.body,
    });
    revalidateServiceCase(data.serviceCaseId);
    return actionOk({ id: note.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
