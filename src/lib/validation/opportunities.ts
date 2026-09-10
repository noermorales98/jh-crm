import { z } from "zod";
import { cuidSchema, moneySchema, optionalDateSchema } from "./common";

export const OPPORTUNITY_STAGES = [
  "NEW_LEAD",
  "CONTACTED",
  "CONSULTATION",
  "INTAKE_SENT",
  "INTAKE_COMPLETED",
  "PROPOSAL",
  "WAITING_PAYMENT",
  "WON",
  "LOST",
] as const;

export const opportunityCreateSchema = z.object({
  clientId: cuidSchema,
  ownerId: cuidSchema.optional().nullable(),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  estimatedValue: moneySchema.optional().nullable(),
  source: z.string().trim().max(150).nullish().or(z.literal("")),
  campaign: z.string().trim().max(150).nullish().or(z.literal("")),
  nextFollowUpAt: optionalDateSchema,
});

const LEAD_CHANNELS = [
  "FACEBOOK",
  "INSTAGRAM",
  "GOOGLE",
  "WEBSITE",
  "REFERRAL",
  "MANUAL",
  "OTHER",
] as const;

/** LD-001 — alta de prospecto (Client + Opportunity). */
export const leadCreateSchema = z.object({
  firstName: z.string().trim().min(1, "El nombre es obligatorio.").max(100),
  lastName: z.string().trim().max(100).nullish().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Correo inválido.")
    .max(200)
    .nullish()
    .or(z.literal("")),
  phone: z.string().trim().max(40).nullish().or(z.literal("")),
  source: z.string().trim().max(150).nullish().or(z.literal("")),
  leadChannel: z.enum(LEAD_CHANNELS).optional().nullable(),
  serviceRequested: z.string().trim().max(150).nullish().or(z.literal("")),
  ownerId: cuidSchema.optional().nullable(),
  estimatedValue: moneySchema.optional().nullable(),
  campaign: z.string().trim().max(150).nullish().or(z.literal("")),
  nextFollowUpAt: optionalDateSchema,
});

export const opportunityUpdateStageSchema = z.object({
  stage: z.enum(OPPORTUNITY_STAGES),
});

export const opportunityMarkLostSchema = z.object({
  lostReason: z
    .string()
    .trim()
    .min(1, "Indica el motivo de pérdida.")
    .max(2000),
});

export type OpportunityCreateInput = z.infer<typeof opportunityCreateSchema>;
export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

/** LD-002 — editar prospecto (Client) + deal (Opportunity). */
export const leadUpdateSchema = leadCreateSchema.extend({
  opportunityId: cuidSchema,
});

export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;
