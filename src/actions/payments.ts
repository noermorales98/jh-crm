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
import * as paymentService from "@/src/server/payments";

const methodEnum = z.enum(["ZELLE", "STRIPE", "CASH", "BANK_TRANSFER", "OTHER"]);

function revalidatePayments() {
  revalidatePath("/crm/pagos");
  revalidatePath("/crm/recibos");
  revalidatePath("/crm/cotizaciones");
  revalidatePath("/crm/dashboard");
}

const registerSchema = z.object({
  clientId: cuidSchema,
  caseId: cuidSchema.nullish(),
  quoteId: cuidSchema.nullish(),
  amount: moneySchema,
  method: methodEnum,
  status: z.enum(["PENDING", "RECEIVED"]).optional(),
  reference: z.string().trim().max(200).nullish(),
  dueAt: optionalDateSchema,
  receivedAt: optionalDateSchema,
  notes: z.string().trim().max(5000).nullish(),
});

export async function registerPayment(
  input: unknown,
): Promise<
  ActionResult<{
    paymentId: string;
    receiptId: string | null;
    receiptFolio: string | null;
    quoteStatus: string | null;
  }>
> {
  try {
    const ctx = await requirePermission("payments.register");
    const data = registerSchema.parse(input);
    const result = await paymentService.registerPayment(ctx, data);
    revalidatePayments();
    return actionOk({
      paymentId: result.payment.id,
      receiptId: result.receipt?.id ?? null,
      receiptFolio: result.receipt?.folio ?? null,
      quoteStatus: result.quoteStatus ?? null,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const updatePendingSchema = z.object({
  amount: moneySchema.optional(),
  method: methodEnum.optional(),
  reference: z.string().trim().max(200).nullish(),
  dueAt: optionalDateSchema,
  notes: z.string().trim().max(5000).nullish(),
});

export async function updatePendingPayment(
  paymentId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("payments.register");
    const id = cuidSchema.parse(paymentId);
    const data = updatePendingSchema.parse(input);
    const payment = await paymentService.updatePendingPayment(ctx, id, data);
    revalidatePayments();
    return actionOk({ id: payment.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const reasonSchema = z.object({ reason: z.string().trim().max(1000).optional() });

export async function cancelPayment(
  paymentId: string,
  input: unknown = {},
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("payments.register");
    const id = cuidSchema.parse(paymentId);
    const { reason } = reasonSchema.parse(input ?? {});
    const payment = await paymentService.cancelPayment(ctx, id, reason);
    revalidatePayments();
    return actionOk({ id: payment.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function refundPaymentRecord(
  paymentId: string,
  input: unknown = {},
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("payments.register");
    const id = cuidSchema.parse(paymentId);
    const { reason } = reasonSchema.parse(input ?? {});
    const payment = await paymentService.refundPaymentRecord(ctx, id, reason);
    revalidatePayments();
    return actionOk({ id: payment.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function startQuoteCheckoutAction(
  quoteId: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const ctx = await requirePermission("payments.register");
    const id = cuidSchema.parse(quoteId);
    const { startQuoteCheckout } = await import("@/src/server/payments/stripe");
    const result = await startQuoteCheckout(ctx, id);
    revalidatePayments();
    revalidatePath(`/crm/cotizaciones/${id}`);
    return actionOk({ url: result.url });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
