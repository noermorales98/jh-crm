"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FundingApplicationStatus } from "@prisma/client";
import { cuidSchema, optionalDateSchema } from "@/src/lib/validation/common";
import { requirePermission } from "@/src/server/auth/guards";
import { actionOk, actionFail, isNextControlError, type ActionResult } from "@/src/server/errors";
import * as funding from "@/src/server/funding";

const amountSchema = z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, "Monto inválido (máximo 2 decimales).").nullish();
const applicationSchema = z.object({ lenderName: z.string().trim().min(1, "Indica el prestamista.").max(191), requestedAmount: amountSchema, approvedAmount: amountSchema, status: z.enum(FundingApplicationStatus).default("DRAFT"), submittedAt: optionalDateSchema, decisionAt: optionalDateSchema, notes: z.string().trim().max(5000).nullish() });
function refresh(serviceCaseId: string, clientId: string) {
  revalidatePath(`/crm/expedientes/${serviceCaseId}`);
  revalidatePath(`/crm/clientes/${clientId}/actividad`);
  revalidatePath(`/crm/clientes/${clientId}/servicios`);
}
export async function createFundingApplicationAction(serviceCaseId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(serviceCaseId);
    const row = await funding.createFundingApplication(ctx, id, applicationSchema.parse(input));
    refresh(id, row.clientId); return actionOk({ id: row.id });
  } catch (error) { if (isNextControlError(error)) throw error; return actionFail(error); }
}
export async function updateFundingApplicationAction(serviceCaseId: string, applicationId: string, updatedAt: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("cases.manage");
    const id = cuidSchema.parse(serviceCaseId);
    const row = await funding.updateFundingApplication(ctx, id, cuidSchema.parse(applicationId), z.coerce.date().parse(updatedAt), applicationSchema.parse(input));
    refresh(id, row.clientId); return actionOk({ id: row.id });
  } catch (error) { if (isNextControlError(error)) throw error; return actionFail(error); }
}
