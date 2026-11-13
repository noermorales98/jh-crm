import { z } from "zod";
import { cuidSchema, moneySchema, optionalDateSchema } from "./common";

/** Ítem de cotización tal como lo recibe la action (y el conector de Claude). */
export const quoteItemSchema = z.object({
  kind: z.enum(["service", "package", "manual"]),
  serviceId: cuidSchema.optional(),
  packageId: cuidSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  quantity: moneySchema,
  unitPrice: moneySchema.optional(),
  discountAmount: moneySchema.optional(),
});

export const createQuoteSchema = z.object({
  clientId: cuidSchema,
  caseId: cuidSchema.nullish(),
  items: z.array(quoteItemSchema).min(1, "Agrega al menos un ítem."),
  validUntil: optionalDateSchema,
  notes: z.string().trim().max(5000).nullish(),
  terms: z.string().trim().max(10000).nullish(),
  taxRate: moneySchema.optional(),
});

export const updateQuoteSchema = createQuoteSchema.omit({ clientId: true, caseId: true }).partial();
