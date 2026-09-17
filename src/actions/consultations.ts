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
import { cuidSchema, moneySchema, optionalDateSchema } from "@/src/lib/validation/common";
import * as consultations from "@/src/server/consultations";

const CONSULTATION_STATUSES = [
  "REQUESTED",
  "PAYMENT_PENDING",
  "PAID",
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
] as const;

function revalidateConsultations(clientId?: string) {
  revalidatePath("/crm/consultas");
  if (clientId) revalidatePath(`/crm/clientes/${clientId}`);
}

const requestSchema = z.object({
  clientId: cuidSchema,
  amount: moneySchema.optional().nullable(),
  notes: z.string().trim().max(5000).nullish().or(z.literal("")),
});

export async function requestConsultationAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("consultations.manage");
    const data = requestSchema.parse(input);
    const consultation = await consultations.requestConsultation(ctx, {
      clientId: data.clientId,
      amount: data.amount ?? 1,
      notes: data.notes || null,
    });
    revalidateConsultations(data.clientId);
    return actionOk({ id: consultation.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const updateStatusSchema = z.object({
  status: z.enum(CONSULTATION_STATUSES),
  scheduledAt: optionalDateSchema,
  notes: z.string().trim().max(5000).nullish().or(z.literal("")),
});

export async function updateConsultationStatusAction(
  consultationId: string,
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const ctx = await requirePermission("consultations.manage");
    const id = cuidSchema.parse(consultationId);
    const data = updateStatusSchema.parse(input);
    const consultation = await consultations.updateConsultationStatus(
      ctx,
      id,
      data.status,
      {
        scheduledAt: data.scheduledAt,
        notes: data.notes || undefined,
      },
    );
    revalidateConsultations(consultation.clientId);
    return actionOk({ id: consultation.id, status: consultation.status });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function startConsultationCheckoutAction(
  consultationId: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const ctx = await requirePermission("consultations.manage");
    const id = cuidSchema.parse(consultationId);
    const { startConsultationCheckout } = await import(
      "@/src/server/payments/stripe"
    );
    const result = await startConsultationCheckout(ctx, id);
    revalidateConsultations();
    return actionOk({ url: result.url });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function sendConsultationCheckoutWhatsappAction(
  consultationId: string,
): Promise<ActionResult<{ url: string; to: string }>> {
  try {
    const ctx = await requirePermission("consultations.manage");
    const id = cuidSchema.parse(consultationId);
    const { sendConsultationCheckoutWhatsapp } = await import(
      "@/src/server/payments/stripe"
    );
    const result = await sendConsultationCheckoutWhatsapp(ctx, id);
    revalidateConsultations();
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
