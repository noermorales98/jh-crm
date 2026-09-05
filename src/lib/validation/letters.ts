import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import { creditBureauSchema } from "@/src/lib/validation/credit-reports";

export const createLetterTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  content: z.string().trim().min(20).max(50000),
  bureau: creditBureauSchema.optional().nullable(),
});

export const updateLetterTemplateSchema = createLetterTemplateSchema.partial().extend({
  active: z.boolean().optional(),
});

export const previewLetterSchema = z.object({
  roundId: cuidSchema,
  bureau: creditBureauSchema,
  templateId: cuidSchema,
  disputeItemIds: z.array(cuidSchema).min(1).max(50),
});

export const createLetterDraftSchema = previewLetterSchema.extend({
  subject: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(20).max(50000).optional(),
  recipient: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
});

export const updateLetterDraftSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(20).max(50000).optional(),
  recipient: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
});

export const markLetterSentSchema = z.object({
  trackingNumber: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
});

export const generateProgressReportSchema = z.object({
  caseId: cuidSchema,
  roundId: cuidSchema.optional().nullable(),
  nextSteps: z.string().trim().max(2000).optional().nullable().or(z.literal("")),
});
