/**
 * CR-PDF-001 — Importación de PDFs de crédito (propose + confirm).
 */
import type { OrganizationContext } from "@/src/server/auth/guards";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import {
  getObjectBytes,
  isStorageConfigured,
} from "@/src/lib/storage/s3";
import { writeAuditLog } from "@/src/server/audit";
import * as clients from "@/src/server/clients";
import * as creditReports from "@/src/server/credit-reports";
import { encrypt, ssnLast4 as deriveSsnLast4 } from "@/src/lib/security/encryption";
import type {
  ConfirmCreditPdfImportInput,
  CreditPdfExtractionProposal,
} from "@/src/lib/validation/credit-import";
import { extractPdfContent } from "./pdf-text";
import { classifyAndExtractFromPdf } from "./extract";

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
  if (pdfBytes.byteLength > 12 * 1024 * 1024) {
    throw new DomainError("El PDF supera 12 MB; divide o comprime el archivo.");
  }

  const extract = await extractPdfContent(pdfBytes);
  const fileName =
    document.displayName || document.originalName || "reporte.pdf";

  const proposal = await classifyAndExtractFromPdf({
    extract,
    pdfBytes,
    fileName,
  });

  const sensitive = await prisma.clientSensitiveProfile.findUnique({
    where: { clientId: creditCase.clientId },
    select: { ssnLast4: true, dateOfBirthEncrypted: true },
  });

  const suggestedReportType =
    proposal.documentKind === "CLIENT_PROGRESS_REPORT"
      ? "UPDATE"
      : proposal.report?.typeHint === "INITIAL" ||
          proposal.report?.typeHint === "UPDATE" ||
          proposal.report?.typeHint === "MANUAL"
        ? proposal.report.typeHint
        : "UPDATE";

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

export async function confirmCreditPdfImport(
  ctx: OrganizationContext,
  input: ConfirmCreditPdfImportInput,
): Promise<{ reportId: string; caseId: string; clientId: string }> {
  const { creditCase, document } = await loadCaseDocument(
    ctx,
    input.caseId,
    input.documentId,
  );

  const apply = input.applyClientFields ?? {};
  const patch = input.clientPatch ?? {};
  const overwrite = input.overwriteClient;

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
      dateOfBirth: applyDob && patch.dateOfBirth ? new Date(patch.dateOfBirth) : undefined,
      ssnFull: applySsn ? input.ssnFull ?? null : undefined,
      ssnLast4Only:
        applySsn && !input.ssnFull ? patch.ssnLast4 ?? null : undefined,
    });
  }

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
      input.documentKind === "CLIENT_PROGRESS_REPORT"
        ? "Importado desde progress report PDF."
        : null,
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

  const report = await creditReports.createCreditReport(ctx, {
    caseId: creditCase.id,
    type: input.reportType,
    reportDate: input.reportDate,
    provider,
    documentId: document.id,
    notes,
    snapshots: input.snapshots,
    items:
      input.documentKind === "CLIENT_PROGRESS_REPORT" ? [] : input.items,
  });

  await writeAuditLog(toAuditContext(ctx), {
    action: "CREDIT_PDF_IMPORT_CONFIRMED",
    entityType: "CreditReport",
    entityId: report.id,
    metadata: {
      caseId: creditCase.id,
      documentId: document.id,
      documentKind: input.documentKind,
      snapshotCount: input.snapshots.length,
      itemCount:
        input.documentKind === "CLIENT_PROGRESS_REPORT"
          ? 0
          : input.items.length,
    },
  });

  // Marca jobs SUCCEEDED de este PDF como confirmados → deja de mostrar “Análisis listo”.
  await prisma.creditPdfImportJob.updateMany({
    where: {
      organizationId: ctx.organizationId,
      documentId: document.id,
      status: "SUCCEEDED",
    },
    data: { phase: "confirmed" },
  });

  return {
    reportId: report.id,
    caseId: creditCase.id,
    clientId: creditCase.clientId,
  };
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
