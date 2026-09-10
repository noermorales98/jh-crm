import { z } from "zod";
import { cuidSchema } from "./common";

/** Mensaje / nota humana en un lead (Client). */
export const leadMessageCreateSchema = z.object({
  clientId: cuidSchema,
  opportunityId: cuidSchema.optional(),
  body: z
    .string()
    .trim()
    .min(1, "Escribe un mensaje.")
    .max(5000, "Máximo 5000 caracteres."),
});

export type LeadMessageCreateInput = z.infer<typeof leadMessageCreateSchema>;
