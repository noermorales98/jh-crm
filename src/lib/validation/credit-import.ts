import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  bureauSnapshotInputSchema,
  creditItemInputSchema,
  creditReportTypeSchema,
} from "@/src/lib/validation/credit-reports";

export const creditPdfDocumentKindSchema = z.enum([
  "CREDIT_BUREAU_REPORT",
  "CLIENT_PROGRESS_REPORT",
  "UNKNOWN",
]);

export const creditPdfClientProposalSchema = z.object({
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(50).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().max(50).optional().nullable(),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "DOB debe ser YYYY-MM-DD")
    .optional()
    .nullable(),
  /** Solo last4 en propuestas persistibles / UI. */
  ssnLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "SSN last4 inválido")
    .optional()
    .nullable(),
});

export const creditPdfProgressProposalSchema = z.object({
  periodLabel: z.string().trim().max(120).optional().nullable(),
  nextSteps: z.string().trim().max(5000).optional().nullable(),
});

export const creditPdfExtractionProposalSchema = z.object({
  documentKind: creditPdfDocumentKindSchema,
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  warnings: z.array(z.string().max(500)).max(30).default([]),
  client: creditPdfClientProposalSchema.optional().nullable(),
  report: z
    .object({
      reportDate: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .nullable(),
      provider: z.string().trim().max(120).optional().nullable(),
      typeHint: creditReportTypeSchema.optional().nullable(),
      notes: z.string().trim().max(5000).optional().nullable(),
      snapshots: z.array(bureauSnapshotInputSchema).max(3).default([]),
      items: z.array(creditItemInputSchema).max(200).default([]),
    })
    .optional()
    .nullable(),
  progress: creditPdfProgressProposalSchema.optional().nullable(),
});

export type CreditPdfExtractionProposal = z.infer<
  typeof creditPdfExtractionProposalSchema
>;

export const analyzeCreditPdfInputSchema = z.object({
  caseId: cuidSchema,
  documentId: cuidSchema,
});

export const confirmCreditPdfImportSchema = z.object({
  caseId: cuidSchema,
  documentId: cuidSchema,
  documentKind: creditPdfDocumentKindSchema,
  reportType: creditReportTypeSchema,
  reportDate: z.coerce.date({ error: "Indica la fecha del reporte." }),
  provider: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  snapshots: z.array(bureauSnapshotInputSchema).max(3).default([]),
  /** Índices de items de la propuesta a aplicar, o items inline. */
  items: z.array(creditItemInputSchema).max(200).default([]),
  applyClientFields: z
    .object({
      firstName: z.boolean().optional(),
      lastName: z.boolean().optional(),
      addressLine1: z.boolean().optional(),
      addressLine2: z.boolean().optional(),
      city: z.boolean().optional(),
      state: z.boolean().optional(),
      postalCode: z.boolean().optional(),
      country: z.boolean().optional(),
      dateOfBirth: z.boolean().optional(),
      ssn: z.boolean().optional(),
    })
    .default({}),
  clientPatch: creditPdfClientProposalSchema.optional().nullable(),
  /**
   * SSN completo solo si el staff confirma aplicar SSN y lo pegó en confirmación.
   * Si solo hay last4, se guarda last4 sin cifrado de SSN completo.
   */
  ssnFull: z
    .string()
    .trim()
    .regex(/^\d{3}-?\d{2}-?\d{4}$/, "SSN inválido")
    .optional()
    .nullable(),
  overwriteClient: z.boolean().default(false),
});

export type ConfirmCreditPdfImportInput = z.infer<
  typeof confirmCreditPdfImportSchema
>;
