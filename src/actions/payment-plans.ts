"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import {
  cuidSchema,
  resolveOrgDateInput,
} from "@/src/lib/validation/common";
import { createPlanSchema } from "@/src/lib/validation/payment-plans";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import * as paymentPlans from "@/src/server/payment-plans";

function revalidatePlans(planId?: string, clientId?: string) {
  revalidatePath("/crm/planes-pago");
  revalidatePath("/crm/pagos");
  if (planId) revalidatePath(`/crm/planes-pago/${planId}`);
  if (clientId) revalidatePath(`/crm/clientes/${clientId}`);
}

export async function createPaymentPlanAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("payments.register");
    const data = createPlanSchema.parse(input);
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const plan = await paymentPlans.createPaymentPlan(ctx, {
      ...data,
      startDate: resolveOrgDateInput(data.startDate, tz, 12),
      notes: data.notes || null,
    });
    revalidatePlans(plan.id, data.clientId);
    return actionOk({ id: plan.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function cancelPaymentPlanAction(
  planId: string,
  input: unknown = {},
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("payments.register");
    const id = cuidSchema.parse(planId);
    const { reason } =
      (input as { reason?: string } | null) ?? {};
    const plan = await paymentPlans.cancelPaymentPlan(
      ctx,
      id,
      typeof reason === "string" ? reason : undefined,
    );
    revalidatePlans(plan.id, plan.clientId);
    return actionOk({ id: plan.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
