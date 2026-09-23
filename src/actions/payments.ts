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
import {
  cuidSchema,
  moneySchema,
  orgDateInputSchema,
  resolveOrgDateInput,
} from "@/src/lib/validation/common";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
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
  dueAt: orgDateInputSchema,
  receivedAt: orgDateInputSchema,
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
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const result = await paymentService.registerPayment(ctx, {
      ...data,
      dueAt: resolveOrgDateInput(data.dueAt, tz, 12),
      receivedAt: resolveOrgDateInput(data.receivedAt, tz, 12),
    });
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
  dueAt: orgDateInputSchema,
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
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const payment = await paymentService.updatePendingPayment(ctx, id, {
      ...data,
      dueAt: resolveOrgDateInput(data.dueAt, tz, 12),
    });
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

export async function sendQuoteCheckoutWhatsappAction(
  quoteId: string,
): Promise<ActionResult<{ url: string; to: string }>> {
  try {
    const ctx = await requirePermission("payments.register");
    const id = cuidSchema.parse(quoteId);
    const { sendQuoteCheckoutWhatsapp } = await import(
      "@/src/server/payments/stripe"
    );
    const result = await sendQuoteCheckoutWhatsapp(ctx, id);
    revalidatePayments();
    revalidatePath(`/crm/cotizaciones/${id}`);
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
