import { z } from "zod";
import { cuidSchema, moneySchema, optionalDateSchema } from "@/src/lib/validation/common";

export const creditReportTypeSchema = z.enum(["INITIAL", "UPDATE", "MANUAL"]);
export const creditBureauSchema = z.enum(["EXPERIAN", "EQUIFAX", "TRANSUNION"]);
export const creditNegativeTypeSchema = z.enum([
  "COLLECTION",
  "CHARGE_OFF",
  "LATE_PAYMENT",
  "REPOSSESSION",
  "BANKRUPTCY",
  "HARD_INQUIRY",
  "FORECLOSURE",
  "OTHER",
]);
export const creditItemLifecycleSchema = z.enum([
  "IDENTIFIED",
  "UNDER_REVIEW",
  "SELECTED",
  "DISPUTED",
  "RESOLVED",
  "EXCLUDED",
]);

const optionalInt = z.number().int().min(0).max(9999).optional().nullable();
const optionalScore = z.number().int().min(300).max(900).optional().nullable();
const optionalMoney = moneySchema.optional().nullable();

export const bureauSnapshotInputSchema = z.object({
  bureau: creditBureauSchema,
  score: optionalScore,
  totalAccounts: optionalInt,
  openAccounts: optionalInt,
  closedAccounts: optionalInt,
  negativeAccounts: optionalInt,
  collections: optionalInt,
  inquiries: optionalInt,
  totalBalance: optionalMoney,
  utilization: z
    .union([z.string(), z.number()])
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100, {
      message: "Utilización inválida (0–100).",
    })
    .optional()
    .nullable(),
});

export const creditItemInputSchema = z.object({
  creditorName: z.string().trim().min(1, "Indica el acreedor.").max(200),
  accountNumberMasked: z
    .string()
    .trim()
    .max(32)
    .regex(/^[*\dXx\- ]*$/, "Solo dígitos enmascarados (ej. ****1234).")
    .optional()
    .nullable()
    .or(z.literal("")),
  accountType: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  bureau: creditBureauSchema,
  balance: optionalMoney,
  creditLimit: optionalMoney,
  monthlyPayment: optionalMoney,
  dateOpened: optionalDateSchema,
  dateReported: optionalDateSchema,
  accountStatus: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  paymentStatus: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  negativeType: creditNegativeTypeSchema.optional().nullable(),
  remarks: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
  isNegative: z.boolean().optional(),
  disputeEligible: z.boolean().optional(),
  lifecycleStatus: creditItemLifecycleSchema.optional(),
});

export const createCreditReportSchema = z.object({
  caseId: cuidSchema,
  type: creditReportTypeSchema.default("MANUAL"),
  reportDate: z.coerce.date({ error: "Indica la fecha del reporte." }),
  provider: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  externalReportId: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  documentId: cuidSchema.optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
  snapshots: z.array(bureauSnapshotInputSchema).max(3).optional(),
  items: z.array(creditItemInputSchema).max(200).optional(),
});

export const updateCreditReportSchema = z.object({
  type: creditReportTypeSchema.optional(),
  reportDate: z.coerce.date().optional(),
  provider: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  externalReportId: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  documentId: cuidSchema.optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable().or(z.literal("")),
  snapshots: z.array(bureauSnapshotInputSchema).max(3).optional(),
});

export const addCreditItemSchema = creditItemInputSchema.extend({
  reportId: cuidSchema,
});

export const updateCreditItemSchema = creditItemInputSchema.partial().extend({
  creditorName: z.string().trim().min(1).max(200).optional(),
  bureau: creditBureauSchema.optional(),
});
