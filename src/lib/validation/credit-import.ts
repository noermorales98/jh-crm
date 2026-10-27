import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  bureauSnapshotInputSchema,
  creditBureauSchema,
  creditItemInputSchema,
  creditReportTypeSchema,
} from "@/src/lib/validation/credit-reports";

/** Por encima del fixture de 250. El alta manual de reportes sigue en 200. */
export const EXTRACTION_ITEM_CEILING = 400;

export const creditPdfCoverageSchema = z.object({
  pipelineVersion: z.string().max(80),
  status: z.enum(["COMPLETE", "PARTIAL"]),
  plannedWindows: z.number().int().min(0),
  validWindows: z.number().int().min(0),
  plannedPages: z.number().int().min(0),
  emptyPages: z.number().int().min(0),
  omittedItems: z.number().int().min(0).default(0),
  metricsBlocked: z.boolean(),
});

export const creditPdfReviewSchema = z.object({
  version: z.string().max(80),
  revision: z.number().int().min(0),
  status: z.enum(["DRAFT", "CONFIRMED"]),
  idempotencyKey: z.string().max(120).nullable().optional(),
  reportId: z.string().max(191).nullable().optional(),
  reviewedFieldIds: z.array(z.string().max(80)).max(500).default([]),
  authorUserId: z.string().max(191).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  disputeAuthorized: z.literal(false).default(false),
  inaccuracyConfirmed: z.literal(false).default(false),
});

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

/** Identidades propuestas (v2); vacío en pipeline PDF actual. */
export const creditPdfIdentityDecisionSchema = z.object({
  observationIds: z.array(z.string().max(200)).min(1).max(50),
  canonicalId: z.string().max(200).nullable().default(null),
  status: z.enum(["UNLINKED", "PROPOSED", "CONFIRMED"]),
  signals: z.array(z.string().max(120)).max(40).default([]),
  conflicts: z.array(z.string().max(200)).max(40).default([]),
  reviewedBy: z.string().max(191).nullable().default(null),
  identityVersion: z.number().int().min(0).default(0),
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
      items: z.array(creditItemInputSchema).max(EXTRACTION_ITEM_CEILING).default([]),
      inquiriesObserved: z
        .array(
          z.object({
            bureau: creditBureauSchema,
            creditorName: z.string().trim().max(200).optional().nullable(),
            inquiredOn: z
              .string()
              .trim()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional()
              .nullable(),
            kind: z.string().trim().max(40).optional().nullable(),
          }),
        )
        .max(EXTRACTION_ITEM_CEILING)
        .optional()
        .nullable(),
    })
    .optional()
    .nullable(),
  progress: creditPdfProgressProposalSchema.optional().nullable(),
  coverage: creditPdfCoverageSchema.optional().nullable(),
  review: creditPdfReviewSchema.optional().nullable(),
  /** Opcional: pipeline PDF actual no llena identidades. */
  identities: z.array(creditPdfIdentityDecisionSchema).max(200).optional(),
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
  /**
   * Ignorados en servidor: snapshots/items salen solo de proposalJson.
   * Se conservan opcionales para no romper clientes viejos.
   */
  snapshots: z.array(bureauSnapshotInputSchema).max(3).optional().default([]),
  items: z.array(creditItemInputSchema).max(EXTRACTION_ITEM_CEILING).optional().default([]),
  /** Subconjunto de `proposal.report.items` por índice (canónico). */
  selectedItemIndexes: z
    .array(z.number().int().min(0).max(EXTRACTION_ITEM_CEILING - 1))
    .max(EXTRACTION_ITEM_CEILING)
    .optional(),
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
  expectedRevision: z.number().int().min(0).default(0),
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
  reason: z.string().trim().max(500).optional(),
  reviewedFieldIds: z.array(z.string().max(80)).max(500).default([]),
  identityDecisionIds: z.array(z.string().max(200)).max(200).default([]),
});

export const saveCreditPdfDraftSchema = z.object({
  caseId: cuidSchema,
  documentId: cuidSchema,
  expectedRevision: z.number().int().min(0).default(0),
  reason: z.string().trim().max(500).default("borrador de importación"),
});

export type ConfirmCreditPdfImportInput = z.infer<
  typeof confirmCreditPdfImportSchema
>;
