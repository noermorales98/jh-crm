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

/** Nota humana en un expediente (ServiceCase), vía CreditCase visible en UI. */
export const serviceCaseNoteCreateSchema = z.object({
  caseId: cuidSchema,
  body: z
    .string()
    .trim()
    .min(1, "Escribe una nota.")
    .max(5000, "Máximo 5000 caracteres."),
});

export type ServiceCaseNoteCreateInput = z.infer<
  typeof serviceCaseNoteCreateSchema
>;
