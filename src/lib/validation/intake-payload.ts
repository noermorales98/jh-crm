import { z } from "zod";

export const INTAKE_PRIMARY_GOALS = [
  "HOME_PURCHASE",
  "VEHICLE",
  "BUSINESS",
  "PERSONAL",
  "OTHER",
] as const;

export const intakePayloadSchema = z.object({
  primaryGoal: z.enum(INTAKE_PRIMARY_GOALS).optional(),
  consultationReason: z
    .string()
    .trim()
    .max(2000, "El motivo es demasiado largo.")
    .optional()
    .or(z.literal("")),
  hasCollection: z.boolean().optional(),
  hasChargeOff: z.boolean().optional(),
  hasLatePayments: z.boolean().optional(),
  hasRepossession: z.boolean().optional(),
  hasBankruptcy: z.boolean().optional(),
  hasHardInquiries: z.boolean().optional(),
  reportProvider: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable()
    .or(z.literal("")),
  hasRecentReportAccess: z.boolean().optional(),
});

export type IntakePayloadInput = z.infer<typeof intakePayloadSchema>;
