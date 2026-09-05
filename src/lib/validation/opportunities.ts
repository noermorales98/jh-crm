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
