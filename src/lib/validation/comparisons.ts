import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";

export const comparisonResultKindSchema = z.enum([
  "DELETED",
  "UPDATED",
  "VERIFIED",
  "UNCHANGED",
  "NEW",
]);

export const createComparisonSchema = z.object({
  caseId: cuidSchema,
  baseReportId: cuidSchema,
  compareReportId: cuidSchema,
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
});

export const overrideComparisonItemSchema = z.object({
  manualResult: comparisonResultKindSchema.nullable(),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
});
