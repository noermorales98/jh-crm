import { z } from "zod";
import { cuidSchema, moneySchema, optionalDateSchema } from "./common";

export const PROCESSOR_ACCOUNT_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "EXPIRED",
  "CANCELLED",
] as const;

export const processorCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(150),
  type: z.string().trim().max(50).optional(),
  websiteUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .or(z.literal(""))
    .refine((v) => !v || /^https?:\/\//i.test(v), "URL inválida."),
  affiliateUrl: z.string().trim().max(2000).nullish().or(z.literal("")),
  monthlyPrice: moneySchema.optional().nullable(),
  commission: moneySchema.optional().nullable(),
  instructions: z.string().trim().max(5000).nullish().or(z.literal("")),
  active: z.boolean().optional(),
});

export const processorUpdateSchema = processorCreateSchema.partial();

export const linkProcessorAccountSchema = z.object({
  processorId: cuidSchema,
  clientId: cuidSchema,
  caseId: cuidSchema.optional().nullable(),
  externalMemberId: z.string().trim().max(200).nullish().or(z.literal("")),
  externalUrl: z.string().trim().max(2000).nullish().or(z.literal("")),
  status: z.enum(PROCESSOR_ACCOUNT_STATUSES).optional(),
  startedAt: optionalDateSchema,
  expiresAt: optionalDateSchema,
  notes: z.string().trim().max(2000).nullish().or(z.literal("")),
});

export const updateProcessorAccountSchema = z.object({
  externalMemberId: z.string().trim().max(200).nullish().or(z.literal("")),
  externalUrl: z.string().trim().max(2000).nullish().or(z.literal("")),
  status: z.enum(PROCESSOR_ACCOUNT_STATUSES).optional(),
  startedAt: optionalDateSchema,
  expiresAt: optionalDateSchema,
  notes: z.string().trim().max(2000).nullish().or(z.literal("")),
  caseId: cuidSchema.optional().nullable(),
});

export type ProcessorCreateInput = z.infer<typeof processorCreateSchema>;
export type ProcessorUpdateInput = z.infer<typeof processorUpdateSchema>;
export type LinkProcessorAccountInput = z.infer<typeof linkProcessorAccountSchema>;
export type UpdateProcessorAccountInput = z.infer<typeof updateProcessorAccountSchema>;
