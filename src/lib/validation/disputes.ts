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

export const addDisputeItemSchema = z.object({
  roundId: cuidSchema,
  creditItemId: cuidSchema,
  disputeReason: z.string().trim().min(1, "Indica el motivo de disputa.").max(200),
  disputeDetails: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
  bureau: creditBureauSchema.optional(),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
  status: disputeItemStatusSchema.optional(),
});

export const addDisputeItemsBulkSchema = z.object({
  roundId: cuidSchema,
  creditItemIds: z.array(cuidSchema).min(1).max(100),
  disputeReason: z.string().trim().min(1, "Indica el motivo de disputa.").max(200),
  disputeDetails: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
});

export const updateDisputeItemSchema = z.object({
  disputeReason: z.string().trim().min(1).max(200).optional(),
  disputeDetails: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
  status: disputeItemStatusSchema.optional(),
  outcome: disputeOutcomeSchema.optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
});
