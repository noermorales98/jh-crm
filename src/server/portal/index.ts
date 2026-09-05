import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { DocumentCategory, DocumentSensitivity } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import {
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  isStorageConfigured,
} from "@/src/lib/storage/s3";
import { assertAllowedFile, buildStorageKey } from "@/src/lib/storage/policy";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import { writeAuditLog } from "@/src/server/audit";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext, toAuditContext } from "@/src/server/context";
import { clientFullName } from "@/src/server/page-helpers";

/**
 * Portal del cliente (FEATURE_CLIENT_PORTAL).
 * Sesión separada del staff: ClientPortalAccess, no User/OrganizationMember.
 */

export const PORTAL_UPLOAD_CATEGORIES = [
  "IDENTITY",
  "PROOF_OF_ADDRESS",
  "OTHER",
  "PAYMENT_PROOF",
  "CREDIT_REPORT",
] as const satisfies readonly DocumentCategory[];

export type PortalUploadCategory = (typeof PORTAL_UPLOAD_CATEGORIES)[number];

export interface PortalContext {
  accessId: string;
  clientId: string;
  organizationId: string;
  email: string;
}

export function isPortalEnabled(): boolean {
  return process.env.FEATURE_CLIENT_PORTAL === "true";
}

function assertPortalEnabled() {
  if (!isPortalEnabled()) {
    throw new DomainError(
      "El portal de clientes está desactivado. Activa FEATURE_CLIENT_PORTAL=true.",
    );
  }
}

function assertFileAllowed(mimeType: string, sizeBytes: number) {
  try {
    assertAllowedFile(mimeType, sizeBytes);
  } catch (error) {
    throw new DomainError(
      error instanceof Error ? error.message : "Archivo no permitido.",
    );
  }
}

function assertStorage() {
  if (!isStorageConfigured()) {
    throw new DomainError("Almacenamiento no configurado.");
  }
}

function isPortalCategory(category: DocumentCategory): category is PortalUploadCategory {
  return (PORTAL_UPLOAD_CATEGORIES as readonly string[]).includes(category);
}

/** Invite / re-invite: hash bcrypt, upsert por clientId, activity + audit. */
export async function invitePortalAccess(
  ctx: OrganizationContext,
  data: { clientId: string; email: string; temporaryPassword: string },
) {
  assertPortalEnabled();
  const email = data.email.trim().toLowerCase();
  if (!email) throw new DomainError("El correo es obligatorio.");
  if (data.temporaryPassword.length < 8) {
    throw new DomainError("La contraseña temporal debe tener al menos 8 caracteres.");
  }

  const client = await prisma.client.findFirst({
    where: { id: data.clientId, organizationId: ctx.organizationId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  const passwordHash = await bcrypt.hash(data.temporaryPassword, 12);

  const access = await prisma.$transaction(async (tx) => {
    const row = await tx.clientPortalAccess.upsert({
      where: { clientId: client.id },
      create: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        email,
        passwordHash,
        isActive: true,
        invitedById: ctx.userId,
        revokedAt: null,
      },
      update: {
        email,
        passwordHash,
        isActive: true,
        invitedAt: new Date(),
        invitedById: ctx.userId,
        revokedAt: null,
        sessionVersion: { increment: 1 },
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "PORTAL_ACCESS_INVITED",
        description: `Acceso al portal invitado para ${clientFullName(client)} (${email}).`,
        clientId: client.id,
        metadata: { portalAccessId: row.id },
      },
      tx,
    );
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "PORTAL_ACCESS_INVITED",
        entityType: "ClientPortalAccess",
        entityId: row.id,
        metadata: { clientId: client.id },
      },
      tx,
    );

    return row;
  });

  return {
    id: access.id,
    email: access.email,
    isActive: access.isActive,
    invitedAt: access.invitedAt,
  };
}

export async function revokePortalAccess(
  ctx: OrganizationContext,
  clientId: string,
) {
  assertPortalEnabled();
  const access = await prisma.clientPortalAccess.findFirst({
    where: { clientId, organizationId: ctx.organizationId },
  });
  if (!access) throw new DomainError("Este cliente no tiene acceso al portal.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.clientPortalAccess.update({
      where: { id: access.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "PORTAL_ACCESS_REVOKED",
        description: "Acceso al portal revocado.",
        clientId,
        metadata: { portalAccessId: access.id },
      },
      tx,
    );
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "PORTAL_ACCESS_REVOKED",
        entityType: "ClientPortalAccess",
        entityId: access.id,
        metadata: { clientId },
      },
      tx,
    );

    return updated;
  });
}

export async function getPortalAccess(
  ctx: OrganizationContext,
  clientId: string,
) {
  return prisma.clientPortalAccess.findFirst({
    where: { clientId, organizationId: ctx.organizationId },
    select: {
      id: true,
      email: true,
      isActive: true,
      invitedAt: true,
      revokedAt: true,
      lastLoginAt: true,
      invitedBy: { select: { id: true, name: true } },
    },
  });
}

/** Autenticación portal (Credentials provider id "portal"). */
export async function authenticatePortal(email: string, password: string) {
  if (!isPortalEnabled()) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;

  const candidates = await prisma.clientPortalAccess.findMany({
    where: { email: normalized, isActive: true, revokedAt: null },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
    },
    take: 5,
  });

  for (const access of candidates) {
    const valid = await bcrypt.compare(password, access.passwordHash);
    if (!valid) continue;

    void prisma.clientPortalAccess
      .update({
        where: { id: access.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => {});

    return access;
  }
  return null;
}

export type PortalTokenState = {
  accessId: string;
  organizationId: string;
  clientId: string;
  email: string;
  sessionVersion: number;
};

export async function loadPortalTokenState(
  accessId: string,
): Promise<PortalTokenState | null> {
  const access = await prisma.clientPortalAccess.findUnique({
    where: { id: accessId },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      email: true,
      isActive: true,
      sessionVersion: true,
      revokedAt: true,
    },
  });
  if (!access || !access.isActive || access.revokedAt) return null;
  return {
    accessId: access.id,
    organizationId: access.organizationId,
    clientId: access.clientId,
    email: access.email,
    sessionVersion: access.sessionVersion,
  };
}

/** Resumen del hogar: sin CreditCase.summary ni notas internas. */
export async function getPortalHome(clientId: string, organizationId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true, firstName: true, lastName: true, clientCode: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  const creditCase = await prisma.creditCase.findFirst({
    where: { clientId, organizationId, state: "OPEN" },
    orderBy: { openedAt: "desc" },
    select: {
      id: true,
      caseCode: true,
      state: true,
      nextReviewAt: true,
      stage: { select: { name: true } },
      rounds: {
        orderBy: { roundNumber: "desc" },
        take: 1,
        select: { id: true, roundNumber: true, status: true },
      },
      creditReports: {
        orderBy: { reportDate: "desc" },
        take: 1,
        select: {
          id: true,
          reportDate: true,
          snapshots: {
            select: { bureau: true, score: true },
            orderBy: { bureau: "asc" },
          },
        },
      },
    },
  });

  const latestReport = creditCase?.creditReports[0] ?? null;
  const currentRound = creditCase?.rounds[0] ?? null;

  return {
    client: {
      id: client.id,
      name: clientFullName(client),
      clientCode: client.clientCode,
    },
    activeCase: creditCase
      ? {
          id: creditCase.id,
          caseCode: creditCase.caseCode,
          state: creditCase.state,
          stageName: creditCase.stage.name,
          nextReviewAt: creditCase.nextReviewAt,
          currentRound: currentRound
            ? {
                id: currentRound.id,
                roundNumber: currentRound.roundNumber,
                status: currentRound.status,
              }
            : null,
          scores: latestReport?.snapshots ?? [],
          latestReportDate: latestReport?.reportDate ?? null,
        }
      : null,
  };
}

export async function listPortalDocuments(
  clientId: string,
  organizationId: string,
) {
  return prisma.document.findMany({
    where: {
      clientId,
      organizationId,
      deletedAt: null,
      hardDeletedAt: null,
      sensitivity: { not: "HIGHLY_SENSITIVE" },
      category: { not: "SSN_DOCUMENT" },
    },
    select: {
      id: true,
      category: true,
      originalName: true,
      displayName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function listPortalPayments(
  clientId: string,
  organizationId: string,
) {
  return prisma.payment.findMany({
    where: { clientId, organizationId },
    select: {
      id: true,
      amount: true,
      status: true,
      method: true,
      receivedAt: true,
      createdAt: true,
      receipt: {
        select: { id: true, folio: true, status: true, issuedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function listPortalProgressReports(
  clientId: string,
  organizationId: string,
) {
  const cases = await prisma.creditCase.findMany({
    where: { clientId, organizationId },
    select: { id: true },
  });
  const caseIds = cases.map((c) => c.id);
  if (caseIds.length === 0) return [];

  return prisma.clientProgressReport.findMany({
    where: { organizationId, caseId: { in: caseIds } },
    select: {
      id: true,
      caseCode: true,
      periodLabel: true,
      roundLabel: true,
      reportDate: true,
      nextReviewAt: true,
      scoresJson: true,
      createdAt: true,
    },
    orderBy: { reportDate: "desc" },
    take: 50,
  });
}

/** Último reporte de progreso visible al cliente (campos seguros). */
export async function getLatestPortalProgressReport(
  clientId: string,
  organizationId: string,
) {
  const cases = await prisma.creditCase.findMany({
    where: { clientId, organizationId },
    select: { id: true },
  });
  const caseIds = cases.map((c) => c.id);
  if (caseIds.length === 0) return null;

  const report = await prisma.clientProgressReport.findFirst({
    where: { organizationId, caseId: { in: caseIds } },
    orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      caseId: true,
      caseCode: true,
      clientName: true,
      periodLabel: true,
      roundLabel: true,
      reportDate: true,
      nextReviewAt: true,
      nextSteps: true,
      scoresJson: true,
      resultsJson: true,
      resultLinesJson: true,
    },
  });
  return report;
}

/** Detalle de un reporte del cliente (solo si pertenece a su caso). */
export async function getPortalProgressReport(
  clientId: string,
  organizationId: string,
  reportId: string,
) {
  const report = await prisma.clientProgressReport.findFirst({
    where: {
      id: reportId,
      organizationId,
      case: { clientId, organizationId },
    },
    select: {
      id: true,
      caseId: true,
      caseCode: true,
      clientName: true,
      periodLabel: true,
      roundLabel: true,
      reportDate: true,
      nextReviewAt: true,
      nextSteps: true,
      scoresJson: true,
      resultsJson: true,
      resultLinesJson: true,
    },
  });
  if (!report) throw new DomainError("Reporte de progreso no encontrado.");
  return report;
}

export async function listPortalContracts(
  clientId: string,
  organizationId: string,
) {
  return prisma.clientContract.findMany({
    where: {
      clientId,
      organizationId,
      status: { in: ["SENT", "SIGNED"] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      version: true,
      contentSnapshot: true,
      signedAt: true,
      createdAt: true,
      cancellationDeadline: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export interface PortalUploadData {
  category: DocumentCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  caseId?: string | null;
  sensitivity?: DocumentSensitivity;
}

export interface PortalConfirmUploadData extends PortalUploadData {
  storageKey: string;
  displayName?: string | null;
  checksumSha256?: string | null;
}

async function validatePortalUpload(
  portal: PortalContext,
  data: PortalUploadData,
) {
  if (!isPortalCategory(data.category)) {
    throw new DomainError("Categoría de documento no permitida en el portal.");
  }
  if (data.sensitivity === "HIGHLY_SENSITIVE") {
    throw new DomainError("No puedes subir documentos altamente sensibles.");
  }
  if (data.caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: {
        id: data.caseId,
        clientId: portal.clientId,
        organizationId: portal.organizationId,
      },
      select: { id: true },
    });
    if (!creditCase) {
      throw new DomainError("El caso enlazado no existe o no te pertenece.");
    }
  }
}

export async function requestPortalUpload(
  portal: PortalContext,
  data: PortalUploadData,
) {
  assertPortalEnabled();
  assertStorage();
  await validatePortalUpload(portal, data);
  assertFileAllowed(data.mimeType, data.sizeBytes);

  const storageKey = buildStorageKey(portal.organizationId, crypto.randomUUID());
  const upload = await createPresignedUploadUrl({
    storageKey,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
  });

  return {
    url: upload.url,
    storageKey,
    expiresInSeconds: upload.expiresInSeconds,
    maxBytes: data.sizeBytes,
  };
}

export async function confirmPortalUpload(
  portal: PortalContext,
  data: PortalConfirmUploadData,
) {
  assertPortalEnabled();
  assertStorage();
  await validatePortalUpload(portal, data);
  assertFileAllowed(data.mimeType, data.sizeBytes);

  const expectedPrefix = `org/${portal.organizationId}/documents/`;
  if (!data.storageKey.startsWith(expectedPrefix)) {
    throw new DomainError(
      "La clave de almacenamiento no pertenece a esta organización.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        organizationId: portal.organizationId,
        clientId: portal.clientId,
        caseId: data.caseId ?? null,
        category: data.category,
        sensitivity: data.sensitivity ?? "CONFIDENTIAL",
        originalName: data.originalName.slice(0, 255),
        displayName: data.displayName?.slice(0, 255) ?? null,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        storageKey: data.storageKey,
        checksumSha256: data.checksumSha256 ?? null,
        uploadedById: null,
      },
    });

    await writeActivityLog(
      { organizationId: portal.organizationId, actorUserId: null },
      {
        type: "DOCUMENT_UPLOAD",
        description: `Documento subido desde el portal: ${document.displayName ?? document.originalName}.`,
        clientId: portal.clientId,
        caseId: data.caseId ?? null,
        metadata: {
          documentId: document.id,
          category: data.category,
          source: "portal",
          portalAccessId: portal.accessId,
        },
      },
      tx,
    );

    return document;
  });
}

export async function requestPortalDownload(
  portal: PortalContext,
  documentId: string,
  options?: { disposition?: "attachment" | "inline" },
) {
  assertPortalEnabled();
  assertStorage();

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      clientId: portal.clientId,
      organizationId: portal.organizationId,
      deletedAt: null,
      hardDeletedAt: null,
      sensitivity: { not: "HIGHLY_SENSITIVE" },
      category: { not: "SSN_DOCUMENT" },
    },
  });
  if (!document) throw new DomainError("Documento no encontrado.");

  const hasExt = (n: string) => /\.\w{2,5}$/i.test(n);
  const downloadName =
    (hasExt(document.originalName) ? document.originalName : null) ??
    (document.displayName && hasExt(document.displayName)
      ? document.displayName
      : null) ??
    document.displayName ??
    document.originalName;

  const url = await createPresignedDownloadUrl({
    storageKey: document.storageKey,
    downloadName,
    mimeType: document.mimeType,
    disposition: options?.disposition ?? "attachment",
  });
  return { url, document };
}
