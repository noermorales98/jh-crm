import { z } from "zod";
import { cuidSchema } from "./common";

export const CONTRACT_STATUSES = [
  "DRAFT",
  "SENT",
  "SIGNED",
  "CANCELLED",
  "EXPIRED",
] as const;

export const upsertContractTemplateSchema = z.object({
  id: cuidSchema.optional(),
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  version: z.string().trim().max(40).optional(),
  contentHtml: z
    .string()
    .trim()
    .min(1, "El contenido es obligatorio.")
    .max(200_000),
  active: z.boolean().optional(),
});

export const createContractSchema = z.object({
  clientId: cuidSchema,
  caseId: cuidSchema.optional().nullable(),
  templateId: cuidSchema,
  cancellationDeadlineDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .nullable(),
});

export const signContractSchema = z.object({
  contractId: cuidSchema,
  signerName: z.string().trim().min(1, "El nombre del firmante es obligatorio.").max(200),
  signatureData: z
    .string()
    .min(1, "La firma es obligatoria.")
    .refine((v) => v.startsWith("data:image/"), "Firma inválida."),
});

export type UpsertContractTemplateInput = z.infer<
  typeof upsertContractTemplateSchema
>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type SignContractInput = z.infer<typeof signContractSchema>;
