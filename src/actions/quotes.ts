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
import * as quoteService from "@/src/server/quotes";

function revalidateQuotes(quoteId?: string) {
  revalidatePath("/crm/cotizaciones");
  revalidatePath("/crm/dashboard");
  if (quoteId) revalidatePath(`/crm/cotizaciones/${quoteId}`);
}

const quoteItemSchema = z.object({
  kind: z.enum(["service", "package", "manual"]),
  serviceId: cuidSchema.optional(),
  packageId: cuidSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  quantity: moneySchema,
  unitPrice: moneySchema.optional(),
  discountAmount: moneySchema.optional(),
});

const createQuoteSchema = z.object({
  clientId: cuidSchema,
  caseId: cuidSchema.nullish(),
  items: z.array(quoteItemSchema).min(1, "Agrega al menos un ítem."),
  validUntil: optionalDateSchema,
  notes: z.string().trim().max(5000).nullish(),
  terms: z.string().trim().max(10000).nullish(),
  taxRate: moneySchema.optional(),
});

export async function createQuote(
  input: unknown,
): Promise<ActionResult<{ id: string; folio: string; total: string }>> {
  try {
    const ctx = await requirePermission("quotes.manage");
    const data = createQuoteSchema.parse(input);
    const quote = await quoteService.createQuote(ctx, data);
    revalidateQuotes(quote.id);
    return actionOk({ id: quote.id, folio: quote.folio, total: quote.total.toString() });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const updateQuoteSchema = createQuoteSchema.omit({ clientId: true, caseId: true }).partial();

export async function updateQuote(
  quoteId: string,
  input: unknown,
): Promise<ActionResult<{ id: string; total: string }>> {
  try {
    const ctx = await requirePermission("quotes.manage");
    const id = cuidSchema.parse(quoteId);
    const data = updateQuoteSchema.parse(input);
    const quote = await quoteService.updateQuote(ctx, id, data);
    revalidateQuotes(quote.id);
    return actionOk({ id: quote.id, total: quote.total.toString() });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

async function transition(
  quoteId: string,
  fn: (ctx: Awaited<ReturnType<typeof requirePermission>>, id: string) => Promise<{ id: string }>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("quotes.manage");
    const id = cuidSchema.parse(quoteId);
    const quote = await fn(ctx, id);
    revalidateQuotes(quote.id);
    return actionOk({ id: quote.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function markQuoteSent(quoteId: string) {
  return transition(quoteId, quoteService.markQuoteSent);
}

export async function markQuoteAccepted(quoteId: string) {
  return transition(quoteId, quoteService.markQuoteAccepted);
}

export async function markQuoteRejected(quoteId: string) {
  return transition(quoteId, quoteService.markQuoteRejected);
}

export async function cancelQuote(quoteId: string) {
  return transition(quoteId, quoteService.cancelQuote);
}
