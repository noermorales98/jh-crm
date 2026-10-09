import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import { creditBureauSchema } from "@/src/lib/validation/credit-reports";

export const disputeItemStatusSchema = z.enum([
  "DRAFT",
  "SELECTED",
  "LETTER_GENERATED",
  "SENT",
  "WAITING",
  "RESPONDED",
  "COMPLETED",
  "CANCELLED",
]);

export const disputeOutcomeSchema = z.enum([
  "DELETED",
  "UPDATED",
  "VERIFIED",
  "NO_CHANGE",
  "NOT_RESPONDED",
  "NEW_INFORMATION",
  "OTHER",
]);

/** Alcance del ítem en la ronda (PR-RD-FLAGS). */
export const disputeScopeSchema = z.enum(["OUT_OF_SCOPE", "IN_SCOPE"]);
export type DisputeScope = z.infer<typeof disputeScopeSchema>;

/** Método de disputa (PR-RD-FLAGS). */
export const disputeMethodSchema = z.enum(["MAIL", "ONLINE", "PHONE", "OTHER"]);
export type DisputeMethod = z.infer<typeof disputeMethodSchema>;

export const DEFAULT_DISPUTE_SCOPE: DisputeScope = "OUT_OF_SCOPE";
export const DEFAULT_DISPUTE_METHOD: DisputeMethod = "MAIL";

export const addDisputeItemSchema = z.object({
  roundId: cuidSchema,
  creditItemId: cuidSchema,
  disputeReason: z.string().trim().min(1, "Indica el motivo de disputa.").max(200),
  action: z.string().trim().min(1, "Indica la acción.").max(100),
  scope: disputeScopeSchema.optional(),
  method: disputeMethodSchema.optional(),
  disputeDetails: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
  bureau: creditBureauSchema.optional(),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
  status: disputeItemStatusSchema.optional(),
});

export const addDisputeItemsBulkSchema = z.object({
  roundId: cuidSchema,
  creditItemIds: z.array(cuidSchema).min(1).max(100),
  disputeReason: z.string().trim().min(1, "Indica el motivo de disputa.").max(200),
  action: z.string().trim().min(1, "Indica la acción.").max(100),
  scope: disputeScopeSchema.optional(),
  method: disputeMethodSchema.optional(),
  disputeDetails: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
});

export const updateDisputeItemSchema = z.object({
  disputeReason: z.string().trim().min(1).max(200).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  scope: disputeScopeSchema.optional(),
  method: disputeMethodSchema.optional(),
  disputeDetails: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
  status: disputeItemStatusSchema.optional(),
  outcome: disputeOutcomeSchema.optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
});
