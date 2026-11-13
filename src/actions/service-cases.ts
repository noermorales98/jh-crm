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
import { cuidSchema, resolveOrgDateInput } from "@/src/lib/validation/common";
import {
  caseAmountsSchema,
  createServiceCaseSchema,
  nextActionSchema,
  serviceCaseTransitionSchema,
} from "@/src/lib/validation/case-actions";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import { isServiceCode } from "@/src/server/services/codes";
import * as caseService from "@/src/server/cases";
import * as serviceCaseService from "@/src/server/service-cases";
import { createServiceCaseNote } from "@/src/server/notes";
import { CASE_ROUTE_PATTERN } from "@/src/lib/routes/case-routes";
import { caseHref } from "@/src/lib/routes/case-routes";

function revalidateServiceCase(
  serviceCaseId: string,
  clientId?: string,
  caseId?: string | null,
) {
  revalidatePath(`/crm/expedientes/${serviceCaseId}`);
  revalidatePath(CASE_ROUTE_PATTERN, "layout");
  revalidatePath("/crm/dashboard");
  if (caseId) revalidatePath(CASE_ROUTE_PATTERN, "layout");
  if (clientId) {
    revalidatePath(`/crm/clientes/${clientId}`);
    revalidatePath(`/crm/clientes/${clientId}/servicios`);
    revalidatePath(`/crm/clientes/${clientId}/casos`);
  }
}

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
    const tz = await getOrganizationTimezone(ctx.organizationId);
    if (!isServiceCode(data.serviceCode)) {
      throw new DomainError("Código de servicio inválido.");
    }
    const { serviceCase, creditCase } = await caseService.createServiceCase(
      ctx,
      {
        ...data,
        serviceCode: data.serviceCode,
        nextActionAt: resolveOrgDateInput(data.nextActionAt, tz, 12),
      },
    );
    revalidateServiceCase(serviceCase.id, serviceCase.clientId, creditCase?.id);
    return actionOk({
      serviceCaseId: serviceCase.id,
      caseId: creditCase?.id ?? null,
      caseNumber: serviceCase.caseNumber,
      href: creditCase
        ? caseHref(serviceCase.clientId, creditCase.id)
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

export async function setServiceCaseNextActionAction(
  serviceCaseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(serviceCaseId);
    const { nextActionAt } = nextActionSchema.parse(input);
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const updated = await serviceCaseService.setServiceCaseNextActionAt(
      ctx,
      id,
      resolveOrgDateInput(nextActionAt, tz, 12) ?? null,
    );
    revalidateServiceCase(id, updated.clientId);
    return actionOk({ id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function transitionServiceCaseAction(
  serviceCaseId: string,
  target: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(serviceCaseId);
    const status = serviceCaseTransitionSchema.parse(target);
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

/** PY-002 / Fase 5 — montos del expediente por serviceCaseId. */
export async function updateServiceCaseAmountsAction(
  serviceCaseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(serviceCaseId);
    const data = caseAmountsSchema.parse(input);
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
