/**
 * CR-PDF-001 — Importación de PDFs de crédito (propose + confirm).
 */
import type { Prisma } from "@prisma/client";
import { ForbiddenError, type OrganizationContext } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import { assertCreditAccess } from "@/src/lib/credit/access";
import {
  assertIdentityDecisionIdsAllowed,
  identitiesFromProposal,
  resolveConfirmPayloadFromProposal,
} from "@/src/lib/credit/confirm-proposal";
import { storedPdfProposalBlocksConfirm } from "@/src/lib/credit/pdf-review";
import {
  confirmReview,
  emptyReview,
  saveDraft,
  type ImportReview,
} from "@/src/lib/credit/review";
import {
  getObjectBytes,
  isStorageConfigured,
} from "@/src/lib/storage/s3";
import { writeAuditLog } from "@/src/server/audit";
import * as clients from "@/src/server/clients";
import * as creditReports from "@/src/server/credit-reports";
import { encrypt, ssnLast4 as deriveSsnLast4 } from "@/src/lib/security/encryption";
import {
  creditPdfExtractionProposalSchema,
  type ConfirmCreditPdfImportInput,
  type CreditPdfExtractionProposal,
} from "@/src/lib/validation/credit-import";
import { buildProposalFromDocumentBytes } from "./proposal-from-document";

function toAuditContext(ctx: OrganizationContext) {
  return {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
  };
}

async function loadCaseDocument(
  ctx: OrganizationContext,
  caseId: string,
  documentId: string,
) {
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: {
      id: true,
      clientId: true,
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
        },
      },
    },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: ctx.organizationId,
      deletedAt: null,
      hardDeletedAt: null,
      OR: [{ caseId }, { clientId: creditCase.clientId, caseId: null }],
    },
  });
  if (!document) throw new DomainError("Documento no encontrado en este caso.");
  if (document.mimeType !== "application/pdf") {
    throw new DomainError("Solo se pueden analizar PDFs.");
  }
  if (
    document.category !== "CREDIT_REPORT" &&
    document.category !== "UPDATE_REPORT" &&
    document.category !== "OTHER"
  ) {
    // Allow OTHER so staff can analyze before recategorizing
  }

  return { creditCase, document };
}

export type AnalyzeCreditPdfResult = {
  documentId: string;
  caseId: string;
  clientId: string;
  fileName: string;
  extractMode: "text" | "sparse";
  pageCount: number;
  proposal: CreditPdfExtractionProposal;
  currentClient: {
    firstName: string;
    lastName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    ssnLast4: string | null;
    hasDateOfBirth: boolean;
  };
  suggestedReportType: "INITIAL" | "UPDATE" | "MANUAL";
};

export async function analyzeCreditPdf(
  ctx: OrganizationContext,
  input: { caseId: string; documentId: string },
): Promise<AnalyzeCreditPdfResult> {
  if (!isStorageConfigured()) {
    throw new DomainError("El almacenamiento S3 no está configurado.");
  }

  const { creditCase, document } = await loadCaseDocument(
    ctx,
    input.caseId,
    input.documentId,
  );

  const pdfBytes = await getObjectBytes(document.storageKey);
  const fileName =
    document.displayName || document.originalName || "reporte.pdf";

  const built = await buildProposalFromDocumentBytes({
    pdfBytes,
    fileName,
  });
  const { proposal, extract, suggestedReportType } = built;

  const sensitive = await prisma.clientSensitiveProfile.findUnique({
    where: { clientId: creditCase.clientId },
    select: { ssnLast4: true, dateOfBirthEncrypted: true },
  });

  await writeAuditLog(toAuditContext(ctx), {
    action: "CREDIT_PDF_ANALYZED",
    entityType: "Document",
    entityId: document.id,
    metadata: {
      caseId: creditCase.id,
      documentKind: proposal.documentKind,
      confidence: proposal.confidence,
      extractMode: extract.mode,
      pageCount: extract.pageCount,
      itemCount: proposal.report?.items?.length ?? 0,
      snapshotCount: proposal.report?.snapshots?.length ?? 0,
    },
  });

  return {
    documentId: document.id,
    caseId: creditCase.id,
    clientId: creditCase.clientId,
    fileName,
    extractMode: extract.mode,
    pageCount: extract.pageCount,
    proposal,
    currentClient: {
      firstName: creditCase.client.firstName,
      lastName: creditCase.client.lastName,
      addressLine1: creditCase.client.addressLine1,
      addressLine2: creditCase.client.addressLine2,
      city: creditCase.client.city,
      state: creditCase.client.state,
      postalCode: creditCase.client.postalCode,
      country: creditCase.client.country,
      ssnLast4: sensitive?.ssnLast4 ?? null,
      hasDateOfBirth: Boolean(sensitive?.dateOfBirthEncrypted),
    },
    suggestedReportType,
  };
}

async function applySensitivePartial(
  ctx: OrganizationContext,
  clientId: string,
  opts: {
    dateOfBirth?: Date | null;
    ssnFull?: string | null;
    ssnLast4Only?: string | null;
  },
) {
  const existing = await prisma.clientSensitiveProfile.findUnique({
    where: { clientId },
  });

  const fields: string[] = [];
  const data: {
    ssnEncrypted?: string | null;
    ssnLast4?: string | null;
    dateOfBirthEncrypted?: string | null;
  } = {};

  if (opts.dateOfBirth) {
    data.dateOfBirthEncrypted = encrypt(opts.dateOfBirth.toISOString());
    fields.push("dateOfBirth");
  }
  if (opts.ssnFull?.trim()) {
    const digits = opts.ssnFull.replace(/\D/g, "");
    data.ssnEncrypted = encrypt(digits);
    data.ssnLast4 = deriveSsnLast4(digits);
    fields.push("ssn");
  } else if (opts.ssnLast4Only && /^\d{4}$/.test(opts.ssnLast4Only)) {
    // Solo last4 sin SSN completo (no inventamos el resto).
    data.ssnLast4 = opts.ssnLast4Only;
    fields.push("ssnLast4");
  }

  if (fields.length === 0) return;

  const profile = await prisma.clientSensitiveProfile.upsert({
    where: { clientId },
    update: data,
    create: {
      organizationId: ctx.organizationId,
      clientId,
      ssnEncrypted: data.ssnEncrypted ?? null,
      ssnLast4: data.ssnLast4 ?? null,
      dateOfBirthEncrypted: data.dateOfBirthEncrypted ?? null,
      driversLicenseNumberEncrypted:
        existing?.driversLicenseNumberEncrypted ?? null,
      sensitiveNotesEncrypted: existing?.sensitiveNotesEncrypted ?? null,
    },
  });

  await writeAuditLog(toAuditContext(ctx), {
    action: "SENSITIVE_PROFILE_UPDATED",
    entityType: "ClientSensitiveProfile",
    entityId: profile.id,
    metadata: { clientId, fields, source: "credit_pdf_import" },
  });
}

function toImportReview(review: CreditPdfExtractionProposal["review"]): ImportReview {
  if (!review) return emptyReview();
  return {
    ...emptyReview(),
    version: review.version,
    revision: review.revision,
    status: review.status,
    idempotencyKey: review.idempotencyKey ?? null,
    reportId: review.reportId ?? null,
    reviewedFieldIds: review.reviewedFieldIds ?? [],
    authorUserId: review.authorUserId ?? null,
    reason: review.reason ?? null,
  };
}

function reviewError(error: unknown): Error {
  if (!(error instanceof Error)) return new DomainError("No se pudo revisar la importación.");
  if (error.message === "PUBLICATION_BLOCKED") {
    return new DomainError(
      "La extracción está incompleta. No se publican métricas ni cuentas hasta completarla.",
    );
  }
  if (error.message === "REVIEW_REQUIRED") {
    return new DomainError("Faltan campos críticos por revisar.");
  }
  if (error.message === "REVISION_CONFLICT") {
    return new DomainError("La revisión no coincide. No se publicó otro reporte.");
  }
  return error;
}

async function replayStoredJob(
  organizationId: string,
  jobId: string,
  idempotencyKey: string,
  caseId: string,
  clientId: string,
) {
  const again = await prisma.creditPdfImportJob.findFirst({
    where: { id: jobId, organizationId },
    select: { proposalJson: true },
  });
  const parsed = again?.proposalJson
    ? creditPdfExtractionProposalSchema.safeParse(again.proposalJson)
    : null;
  const review = toImportReview(parsed?.success ? parsed.data.review : null);
  if (review.status === "CONFIRMED" && review.idempotencyKey === idempotencyKey && review.reportId) {
    return { reportId: review.reportId, caseId, clientId };
  }
  throw new DomainError("La confirmación está en curso o la revisión no coincide. No se publicó otro reporte.");
}

export async function confirmCreditPdfImport(
  ctx: OrganizationContext,
  input: ConfirmCreditPdfImportInput,
): Promise<{ reportId: string; caseId: string; clientId: string }> {
  const { creditCase, document } = await loadCaseDocument(
    ctx,
    input.caseId,
    input.documentId,
  );
  assertCreditAccess({
    actor: { organizationId: ctx.organizationId, role: ctx.role },
    clientId: creditCase.clientId,
    resource: { organizationId: ctx.organizationId, clientId: creditCase.clientId },
    mode: "manage",
  });

  const stored = await prisma.creditPdfImportJob.findFirst({
    where: {
      organizationId: ctx.organizationId,
      caseId: input.caseId,
      documentId: input.documentId,
      status: "SUCCEEDED",
    },
    orderBy: { finishedAt: "desc" },
    select: { id: true, phase: true, proposalJson: true },
  });
  const parsed = stored?.proposalJson
    ? creditPdfExtractionProposalSchema.safeParse(stored.proposalJson)
    : null;
  if (storedPdfProposalBlocksConfirm(stored != null, parsed?.success === true)) {
    throw new DomainError("La propuesta no se puede revisar.");
  }
  if (!parsed?.success) {
    throw new DomainError("La propuesta no se puede revisar.");
  }
  const proposal = parsed.data;
  const { snapshots, items } = resolveConfirmPayloadFromProposal({
    proposal,
    documentKind: input.documentKind,
    selectedItemIndexes: input.selectedItemIndexes,
  });
  const identities = identitiesFromProposal(proposal);
  assertIdentityDecisionIdsAllowed(identities, input.identityDecisionIds);

  const requestedSensitive = Boolean(
    input.applyClientFields?.dateOfBirth ||
      input.applyClientFields?.ssn ||
      input.ssnFull?.trim(),
  );
  if (requestedSensitive && !can(ctx.role, "sensitive.edit")) {
    throw new ForbiddenError();
  }
  const currentReview = toImportReview(proposal.review);
  const idempotencyKey = input.idempotencyKey?.trim() || document.id;
  const reason = input.reason?.trim() || "confirmación de importación";
  let decision;
  try {
    decision = confirmReview({
      actor: { organizationId: ctx.organizationId, role: ctx.role },
      clientId: creditCase.clientId,
      resource: { organizationId: ctx.organizationId, clientId: creditCase.clientId },
      review: currentReview,
      expectedRevision: input.expectedRevision,
      idempotencyKey,
      reviewedFieldIds: input.reviewedFieldIds,
      identityDecisionIds: input.identityDecisionIds,
      identities,
      creditCaseId: creditCase.id,
      asOf: input.reportDate.toISOString().slice(0, 10),
      confirmedReportIds: [document.id],
      reportDate: input.reportDate.toISOString().slice(0, 10),
      snapshots,
      items,
      metricsBlocked: proposal.coverage?.metricsBlocked === true,
      authorUserId: ctx.userId,
      reason,
    });
  } catch (error) {
    throw reviewError(error);
  }
  if (decision.outcome === "REPLAY" && decision.review.reportId) {
    return {
      reportId: decision.review.reportId,
      caseId: creditCase.id,
      clientId: creditCase.clientId,
    };
  }

  if (stored && stored.phase !== "confirmed") {
    const claim = await prisma.creditPdfImportJob.updateMany({
      where: {
        id: stored.id,
        organizationId: ctx.organizationId,
        status: "SUCCEEDED",
        NOT: { phase: "confirmed" },
      },
      data: { phase: "confirming" },
    });
    if (claim.count === 0) {
      return replayStoredJob(ctx.organizationId, stored.id, idempotencyKey, creditCase.id, creditCase.clientId);
    }
  }

  const apply = input.applyClientFields ?? {};
  const patch = input.clientPatch ?? {};
  const overwrite = input.overwriteClient;

  let provider = input.provider?.trim() || null;
  if (
    input.documentKind === "CLIENT_PROGRESS_REPORT" &&
    !provider
  ) {
    provider = "Progress Report PDF";
  }

  let notes = input.notes?.trim() || null;
  if (input.documentKind === "CLIENT_PROGRESS_REPORT") {
    const bits = [
      notes,
      "Importado desde progress report PDF.",
    ].filter(Boolean);
    notes = bits.join(" ") || notes;
  }

  // Link document to case if only on client
  if (!document.caseId) {
    await prisma.document.update({
      where: { id: document.id },
      data: { caseId: creditCase.id },
    });
  }

  const revertConfirmPhase = async () => {
    if (!stored) return;
    await prisma.creditPdfImportJob.updateMany({
      where: {
        id: stored.id,
        organizationId: ctx.organizationId,
        phase: "confirming",
      },
      data: { phase: stored.phase },
    });
  };

  // Crear el reporte antes de parchear cliente/SSN: si falla, no queda half-apply.
  let report;
  try {
    report = await creditReports.createCreditReport(ctx, {
      caseId: creditCase.id,
      type: input.reportType,
      reportDate: input.reportDate,
      provider,
      documentId: document.id,
      notes,
      snapshots,
      items,
      inquiries:
        input.documentKind === "CLIENT_PROGRESS_REPORT"
          ? []
          : (proposal.report?.inquiriesObserved ?? []),
    });
  } catch (error) {
    await revertConfirmPhase();
    throw error;
  }

  try {
    const clientUpdate: Parameters<typeof clients.updateClient>[2] = {};
    const empty = (v: string | null | undefined) => !v?.trim();

    const maybeSet = (
      key: keyof typeof apply,
      current: string | null | undefined,
      next: string | null | undefined,
    ) => {
      if (!apply[key] || next == null || !String(next).trim()) return;
      if (!overwrite && !empty(current)) return;
      (clientUpdate as Record<string, string>)[key] = String(next).trim();
    };

    maybeSet("firstName", creditCase.client.firstName, patch.firstName);
    maybeSet("lastName", creditCase.client.lastName, patch.lastName);
    maybeSet("addressLine1", creditCase.client.addressLine1, patch.addressLine1);
    maybeSet("addressLine2", creditCase.client.addressLine2, patch.addressLine2);
    maybeSet("city", creditCase.client.city, patch.city);
    maybeSet("state", creditCase.client.state, patch.state);
    maybeSet("postalCode", creditCase.client.postalCode, patch.postalCode);
    maybeSet("country", creditCase.client.country, patch.country);

    if (Object.keys(clientUpdate).length > 0) {
      await clients.updateClient(ctx, creditCase.clientId, clientUpdate);
    }

    const applyDob =
      apply.dateOfBirth &&
      patch.dateOfBirth &&
      (overwrite ||
        !(
          await prisma.clientSensitiveProfile.findUnique({
            where: { clientId: creditCase.clientId },
            select: { dateOfBirthEncrypted: true },
          })
        )?.dateOfBirthEncrypted);

    const applySsn =
      apply.ssn &&
      (overwrite ||
        !(
          await prisma.clientSensitiveProfile.findUnique({
            where: { clientId: creditCase.clientId },
            select: { ssnLast4: true },
          })
        )?.ssnLast4);

    if (applyDob || applySsn) {
      await applySensitivePartial(ctx, creditCase.clientId, {
        dateOfBirth:
          applyDob && patch.dateOfBirth ? new Date(patch.dateOfBirth) : undefined,
        ssnFull: applySsn ? input.ssnFull ?? null : undefined,
        ssnLast4Only:
          applySsn && !input.ssnFull ? patch.ssnLast4 ?? null : undefined,
      });
    }

    const sealed = {
      ...decision.review,
      reportId: report.id,
      idempotencyKey,
      authorUserId: ctx.userId,
      reason,
      disputeAuthorized: false as const,
      inaccuracyConfirmed: false as const,
    };
    if (stored) {
      await prisma.creditPdfImportJob.update({
        where: { id: stored.id },
        data: {
          phase: "confirmed",
          proposalJson: {
            ...proposal,
            review: {
              version: sealed.version,
              revision: sealed.revision,
              status: "CONFIRMED",
              idempotencyKey: sealed.idempotencyKey,
              reportId: sealed.reportId,
              reviewedFieldIds: sealed.reviewedFieldIds,
              authorUserId: sealed.authorUserId,
              reason: sealed.reason,
              disputeAuthorized: false,
              inaccuracyConfirmed: false,
            },
          } as Prisma.InputJsonValue,
        },
      });
    } else {
      await prisma.creditPdfImportJob.updateMany({
        where: {
          organizationId: ctx.organizationId,
          documentId: document.id,
          status: "SUCCEEDED",
        },
        data: { phase: "confirmed" },
      });
    }

    await writeAuditLog(toAuditContext(ctx), {
      action: "CREDIT_PDF_IMPORT_CONFIRMED",
      entityType: "CreditReport",
      entityId: report.id,
      metadata: {
        caseId: creditCase.id,
        documentId: document.id,
        documentKind: input.documentKind,
        snapshotCount: snapshots.length,
        itemCount: items.length,
        authorUserId: ctx.userId,
        reason,
        revision: decision.review.revision,
      },
    });
  } catch (error) {
    // Compensación: no sellar confirmed; borrar reporte huérfano (cascade) y revertir fase.
    await prisma.creditReport.deleteMany({
      where: { id: report.id, organizationId: ctx.organizationId },
    });
    await revertConfirmPhase();
    throw error;
  }

  return {
    reportId: report.id,
    caseId: creditCase.id,
    clientId: creditCase.clientId,
  };
}

export async function saveCreditPdfImportDraft(
  ctx: OrganizationContext,
  input: { caseId: string; documentId: string; expectedRevision: number; reason: string },
) {
  const { creditCase, document } = await loadCaseDocument(ctx, input.caseId, input.documentId);
  assertCreditAccess({
    actor: { organizationId: ctx.organizationId, role: ctx.role },
    clientId: creditCase.clientId,
    resource: { organizationId: ctx.organizationId, clientId: creditCase.clientId },
    mode: "manage",
  });
  const stored = await prisma.creditPdfImportJob.findFirst({
    where: {
      organizationId: ctx.organizationId,
      caseId: input.caseId,
      documentId: document.id,
      status: "SUCCEEDED",
    },
    orderBy: { finishedAt: "desc" },
    select: { id: true, proposalJson: true },
  });
  if (!stored) throw new DomainError("Importación no encontrada.");
  const parsed = creditPdfExtractionProposalSchema.safeParse(stored.proposalJson);
  if (!parsed.success) throw new DomainError("La propuesta no se puede revisar.");
  const current = toImportReview(parsed.data.review);
  if (input.expectedRevision !== current.revision) {
    throw new DomainError("La revisión no coincide. No se publicó otro reporte.");
  }
  const saved = saveDraft({
    actor: { organizationId: ctx.organizationId, role: ctx.role },
    clientId: creditCase.clientId,
    resource: { organizationId: ctx.organizationId, clientId: creditCase.clientId },
    review: current,
    authorUserId: ctx.userId,
    reason: input.reason,
  });
  await prisma.creditPdfImportJob.update({
    where: { id: stored.id },
    data: {
      proposalJson: {
        ...parsed.data,
        review: {
          version: saved.review.version,
          revision: saved.review.revision,
          status: "DRAFT",
          idempotencyKey: null,
          reportId: saved.review.reportId,
          reviewedFieldIds: saved.review.reviewedFieldIds,
          authorUserId: saved.review.authorUserId,
          reason: saved.review.reason,
          disputeAuthorized: false,
          inaccuracyConfirmed: false,
        },
      } as Prisma.InputJsonValue,
    },
  });
}

/** Lista PDFs del caso aptos para analizar (CREDIT_REPORT / UPDATE_REPORT / OTHER). */
export async function listAnalyzableCreditPdfs(
  ctx: OrganizationContext,
  caseId: string,
) {
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: { id: true, clientId: true },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const docs = await prisma.document.findMany({
    where: {
      organizationId: ctx.organizationId,
      deletedAt: null,
      hardDeletedAt: null,
      mimeType: "application/pdf",
      category: { in: ["CREDIT_REPORT", "UPDATE_REPORT", "OTHER"] },
      OR: [
        { caseId },
        { clientId: creditCase.clientId, caseId: null },
      ],
    },
    select: {
      id: true,
      category: true,
      displayName: true,
      originalName: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return docs.map((d) => ({
    id: d.id,
    category: d.category,
    name: d.displayName || d.originalName,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt,
  }));
}
