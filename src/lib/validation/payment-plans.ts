import { z } from "zod";
import { cuidSchema, moneySchema, optionalDateSchema } from "./common";

export const PAYMENT_PLAN_FREQUENCIES = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "CUSTOM",
] as const;

export const createPlanSchema = z.object({
  clientId: cuidSchema,
  caseId: cuidSchema.optional().nullable(),
  quoteId: cuidSchema.optional().nullable(),
  totalAmount: moneySchema,
  numberOfInstallments: z.coerce
    .number()
    .int()
    .min(2, "Mínimo 2 cuotas.")
    .max(60, "Máximo 60 cuotas."),
  frequency: z.enum(PAYMENT_PLAN_FREQUENCIES),
  startDate: z.coerce.date({ error: "Indica la fecha de inicio." }),
  notes: z.string().trim().max(5000).nullish().or(z.literal("")),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
