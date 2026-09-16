import crypto from "node:crypto";
import type { DocumentCategory, DocumentSensitivity, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import {
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  deleteObject,
  isStorageConfigured,
} from "@/src/lib/storage/s3";
import { assertAllowedFile, buildStorageKey } from "@/src/lib/storage/policy";
import { DomainError } from "@/src/server/errors";

/** Convierte los errores de política de archivos en errores de dominio (400). */
function assertFileAllowed(mimeType: string, sizeBytes: number) {
  try {
    assertAllowedFile(mimeType, sizeBytes);
  } catch (error) {
    throw new DomainError(error instanceof Error ? error.message : "Archivo no permitido.");
  }
}
import { writeActivityLog } from "@/src/server/activity";
import { writeAuditLog } from "@/src/server/audit";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { ForbiddenError } from "@/src/server/auth/guards";
import { toActivityContext, toAuditContext } from "@/src/server/context";

/**
 * Documentos: metadata en MySQL, binario en bucket privado S3.
 * Flujo upload: requestUpload → browser PUT directo → confirmUpload.
 * Descarga: requestDownload (audita si sensibilidad != INTERNAL).
 * Eliminación: soft delete (deletedAt) con auditoría; hard delete vía
 * retención / ADMIN (settings.manage).
 */

export interface RequestUploadData {
  clientId: string;
  caseId?: string | null;
  roundId?: string | null;
  paymentId?: string | null;
  category: DocumentCategory;
  sensitivity?: DocumentSensitivity;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ConfirmUploadData extends RequestUploadData {
  storageKey: string;
  displayName?: string | null;
  checksumSha256?: string | null;
}

function assertStorage() {
  if (!isStorageConfigured()) {
    throw new DomainError("Almacenamiento no configurado.");
  }
}

/** Resuelve y valida enlaces; expone serviceCaseId para dual-write (y smokes). */
export async function resolveDocumentLinks(
  ctx: OrganizationContext,
  data: RequestUploadData,
) {
  return validateLinks(ctx, data);
}

async function validateLinks(ctx: OrganizationContext, data: RequestUploadData) {
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  let serviceCaseId: string | null = null;

  if (data.caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: { id: data.caseId, organizationId: ctx.organizationId, clientId: client.id },
      select: { id: true, serviceCaseId: true },
    });
    if (!creditCase) throw new DomainError("El caso enlazado no existe o no pertenece al cliente.");
    serviceCaseId = creditCase.serviceCaseId;
  }
  if (data.roundId) {
    const round = await prisma.creditRound.findFirst({
      where: { id: data.roundId, organizationId: ctx.organizationId },
      select: { id: true, caseId: true, case: { select: { serviceCaseId: true } } },
    });
    if (!round) throw new DomainError("La ronda enlazada no existe.");
    if (data.caseId && round.caseId !== data.caseId) {
      throw new DomainError("La ronda no pertenece al caso enlazado.");
    }
    serviceCaseId = serviceCaseId ?? round.case.serviceCaseId;
  }
  if (data.paymentId) {
    const payment = await prisma.payment.findFirst({
      where: { id: data.paymentId, organizationId: ctx.organizationId, clientId: client.id },
      select: { id: true, serviceCaseId: true },
    });
    if (!payment) throw new DomainError("El pago enlazado no existe o no pertenece al cliente.");
    serviceCaseId = serviceCaseId ?? payment.serviceCaseId;
  }

  return { serviceCaseId };
}

/** Genera storageKey sin PII y URL firmada PUT de corta duración. */
export async function requestUpload(ctx: OrganizationContext, data: RequestUploadData) {
  assertStorage();
  await validateLinks(ctx, data); // valida enlaces; el dual-write ocurre en confirmUpload
  assertFileAllowed(data.mimeType, data.sizeBytes);

  const storageKey = buildStorageKey(ctx.organizationId, crypto.randomUUID());
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

/** Crea el registro Document tras un upload confirmado por el browser. */
export async function confirmUpload(ctx: OrganizationContext, data: ConfirmUploadData) {
  assertStorage();
  const { serviceCaseId } = await validateLinks(ctx, data);
  assertFileAllowed(data.mimeType, data.sizeBytes);

  // El storageKey debe pertenecer a la organización (prefijo org/<orgId>/).
  const expectedPrefix = `org/${ctx.organizationId}/documents/`;
  if (!data.storageKey.startsWith(expectedPrefix)) {
    throw new DomainError("La clave de almacenamiento no pertenece a esta organización.");
  }

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: data.clientId,
        caseId: data.caseId ?? null,
        serviceCaseId,
        roundId: data.roundId ?? null,
        paymentId: data.paymentId ?? null,
        category: data.category,
        sensitivity: data.sensitivity ?? "CONFIDENTIAL",
        originalName: data.originalName.slice(0, 255),
        displayName: data.displayName?.slice(0, 255) ?? null,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        storageKey: data.storageKey,
        checksumSha256: data.checksumSha256 ?? null,
        uploadedById: ctx.userId,
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "DOCUMENT_UPLOAD",
        description: `Documento subido: ${document.displayName ?? document.originalName} (${data.category}).`,
        clientId: data.clientId,
        caseId: data.caseId ?? null,
        serviceCaseId,
        roundId: data.roundId ?? null,
        metadata: { documentId: document.id, category: data.category, sensitivity: document.sensitivity },
      },
      tx,
    );

    return document;
  });
}

async function getDocumentOrThrow(ctx: OrganizationContext, documentId: string) {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: ctx.organizationId,
      deletedAt: null,
      hardDeletedAt: null,
    },
  });
  if (!document) throw new DomainError("Documento no encontrado.");
  return document;
}

/** URL firmada de descarga/vista. Audita si la sensibilidad no es INTERNAL. */
export async function requestDownload(
  ctx: OrganizationContext,
  documentId: string,
  options?: { disposition?: "attachment" | "inline" },
) {
  assertStorage();
  const document = await getDocumentOrThrow(ctx, documentId);

  if (document.sensitivity !== "INTERNAL") {
    await writeAuditLog(toAuditContext(ctx), {
      action: "DOCUMENT_DOWNLOADED",
      entityType: "Document",
      entityId: document.id,
      metadata: {
        category: document.category,
        sensitivity: document.sensitivity,
        disposition: options?.disposition ?? "attachment",
      },
    });
  }

  // Preferir originalName si ya trae extensión; si no, displayName (se fuerza .pdf vía mime).
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

/** Soft delete: deletedAt + auditoría. El binario permanece hasta purgeAfter. */
export async function softDeleteDocument(ctx: OrganizationContext, documentId: string) {
  const document = await getDocumentOrThrow(ctx, documentId);

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { documentSoftDeleteRetentionDays: true },
  });
  const days = settings?.documentSoftDeleteRetentionDays;
  const now = new Date();
  const purgeAfter =
    typeof days === "number" && days > 0
      ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
      : null;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.document.update({
      where: { id: document.id },
      data: { deletedAt: now, purgeAfter },
    });
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "DOCUMENT_DELETED",
        entityType: "Document",
        entityId: document.id,
        metadata: {
          category: document.category,
          sensitivity: document.sensitivity,
          purgeAfter: purgeAfter?.toISOString() ?? null,
        },
      },
      tx,
    );
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "DOCUMENT_DELETE",
        description: `Documento eliminado: ${document.displayName ?? document.originalName}.`,
        clientId: document.clientId,
        caseId: document.caseId,
        roundId: document.roundId,
        metadata: { documentId: document.id },
      },
      tx,
    );
    return updated;
  });
}

/**
 * Hard delete: borra el objeto S3, marca hardDeletedAt.
 * Solo ADMIN/OWNER (settings.manage). Idempotente si ya está hard-deleted.
 */
export async function hardDeleteDocument(
  ctx: OrganizationContext,
  documentId: string,
): Promise<{ id: string }> {
  if (!can(ctx.role, "settings.manage")) {
    throw new ForbiddenError();
  }

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: ctx.organizationId,
      hardDeletedAt: null,
    },
  });
  if (!document) throw new DomainError("Documento no encontrado.");

  await purgeDocumentRecord(document, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
  });
  return { id: document.id };
}

/** Núcleo de hard-delete usado por CRM y por el cron de retención. */
export async function purgeDocumentRecord(
  document: {
    id: string;
    organizationId: string;
    clientId: string;
    caseId: string | null;
    roundId: string | null;
    storageKey: string;
    displayName: string | null;
    originalName: string;
    category: DocumentCategory;
    sensitivity: DocumentSensitivity;
    deletedAt?: Date | null;
  },
  actor: { organizationId: string; actorUserId?: string | null },
): Promise<void> {
  if (isStorageConfigured() && document.storageKey && !document.storageKey.startsWith("purged/")) {
    try {
      await deleteObject(document.storageKey);
    } catch (error) {
      // Si el objeto ya no existe, seguimos marcando el registro.
      console.error("[documents] deleteObject falló:", error);
    }
  }

  const now = new Date();
  // Conservamos clave única sustituyendo por marcador de auditoría.
  const purgedKey = `purged/${document.organizationId}/${document.id}`;

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: document.id },
      data: {
        hardDeletedAt: now,
        deletedAt: document.deletedAt ?? now,
        purgeAfter: null,
        storageKey: purgedKey,
        sizeBytes: 0,
        checksumSha256: null,
      },
    });
    await writeAuditLog(
      {
        organizationId: actor.organizationId,
        actorUserId: actor.actorUserId ?? null,
      },
      {
        action: "DOCUMENT_HARD_DELETED",
        entityType: "Document",
        entityId: document.id,
        metadata: {
          category: document.category,
          sensitivity: document.sensitivity,
        },
      },
      tx,
    );
    await writeActivityLog(
      {
        organizationId: actor.organizationId,
        actorUserId: actor.actorUserId ?? null,
      },
      {
        type: "DOCUMENT_HARD_DELETED",
        description: `Documento eliminado permanentemente: ${document.displayName ?? document.originalName}.`,
        clientId: document.clientId,
        caseId: document.caseId,
        roundId: document.roundId,
        metadata: { documentId: document.id },
      },
      tx,
    );
  });
}

export interface DocumentListFilters {
  clientId: string;
  caseId?: string;
  roundId?: string;
  paymentId?: string;
  category?: DocumentCategory;
  cursor?: string;
  limit?: number;
}

export async function listDocuments(ctx: OrganizationContext, filters: DocumentListFilters) {
  const limit = Math.min(filters.limit ?? 50, 100);
  const where: Prisma.DocumentWhereInput = {
    organizationId: ctx.organizationId,
    clientId: filters.clientId,
    deletedAt: null,
    hardDeletedAt: null,
    ...(filters.caseId ? { caseId: filters.caseId } : {}),
    ...(filters.roundId ? { roundId: filters.roundId } : {}),
    ...(filters.paymentId ? { paymentId: filters.paymentId } : {}),
    ...(filters.category ? { category: filters.category } : {}),
  };

  const rows = await prisma.document.findMany({
    where,
    select: {
      id: true,
      category: true,
      sensitivity: true,
      originalName: true,
      displayName: true,
      mimeType: true,
      sizeBytes: true,
      caseId: true,
      roundId: true,
      paymentId: true,
      createdAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
