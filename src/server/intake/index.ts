import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import {
  createPresignedUploadUrl,
  isStorageConfigured,
  putObjectBytes,
} from "@/src/lib/storage/s3";
import { assertAllowedFile, buildStorageKey } from "@/src/lib/storage/policy";
import { DomainError } from "@/src/server/errors";
import { nextClientCode } from "@/src/server/folios";
import { writeAuditLog } from "@/src/server/audit";
import type { IntakePayloadInput } from "@/src/lib/validation/intake-payload";

function assertFileAllowed(mimeType: string, sizeBytes: number) {
  try {
    assertAllowedFile(mimeType, sizeBytes);
  } catch (error) {
    throw new DomainError(error instanceof Error ? error.message : "Archivo no permitido.");
  }
}

/**
 * Intake público (feature flag FEATURE_PUBLIC_INTAKE).
 * Sin sesión: la autorización es el token del IntakeLink (largo, aleatorio,
 * expirable, limitado por usos). Auditoría mínima, sin PII en metadata.
 */

export function isIntakeEnabled(): boolean {
  return process.env.FEATURE_PUBLIC_INTAKE === "true";
}

const INVALID_LINK = "Este enlace no es válido o ya no está disponible.";

export interface IntakeLinkInfo {
  id: string;
  organizationId: string;
  clientId: string | null;
  caseId: string | null;
}

/** Valida token: existe, activo, no expirado, usos < maxUses. */
export async function validateIntakeToken(token: string): Promise<IntakeLinkInfo> {
  if (!token || token.length < 20 || token.length > 200) {
    throw new DomainError(INVALID_LINK);
  }
  const link = await prisma.intakeLink.findUnique({ where: { token } });
  if (!link || !link.isActive) throw new DomainError(INVALID_LINK);
  if (link.expiresAt && link.expiresAt < new Date()) throw new DomainError(INVALID_LINK);
  if (link.useCount >= link.maxUses) throw new DomainError(INVALID_LINK);
  return {
    id: link.id,
    organizationId: link.organizationId,
    clientId: link.clientId,
    caseId: link.caseId,
  };
}

/** Datos mínimos no sensibles para pintar el formulario público. */
export async function getIntakeFormData(link: IntakeLinkInfo) {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: link.organizationId },
    select: { legalName: true },
  });

  let prefill: { firstName: string; lastName: string | null } | null = null;
  if (link.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: link.clientId, organizationId: link.organizationId },
      select: { firstName: true, lastName: true },
    });
    prefill = client ?? null;
  }

  return {
    organizationName: settings?.legalName ?? "J&H Multiservices LLC",
    prefill,
    hasCase: Boolean(link.caseId),
  };
}

export interface IntakeSubmitData {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  payload?: IntakePayloadInput | null;
  consent: {
    consentType: string;
    version: string;
    textHash: string;
    signerName?: string | null;
  };
  documents?: Array<{
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    category?:
      | "IDENTITY"
      | "PROOF_OF_ADDRESS"
      | "SSN_DOCUMENT"
      | "CREDIT_REPORT"
      | "DISPUTE_LETTER"
      | "UPDATE_REPORT"
      | "PAYMENT_PROOF"
      | "OTHER";
    checksumSha256?: string | null;
  }>;
}

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Crea o actualiza el cliente (según el link), registra IntakeSubmission,
 * ConsentRecord y Documentos, e incrementa useCount — todo en transacción.
 */
export async function submitIntake(
  link: IntakeLinkInfo,
  data: IntakeSubmitData,
  meta: RequestMeta,
) {
  const orgId = link.organizationId;

  return prisma.$transaction(async (tx) => {
    // Re-validar usos dentro de la transacción (condición de carrera).
    const current = await tx.intakeLink.findUnique({ where: { id: link.id } });
    if (!current || !current.isActive || current.useCount >= current.maxUses) {
      throw new DomainError(INVALID_LINK);
    }
    if (current.expiresAt && current.expiresAt < new Date()) {
      throw new DomainError(INVALID_LINK);
    }

    // Cliente: actualizar el existente o crear uno nuevo con folio.
    let clientId = link.clientId;
    if (clientId) {
      const client = await tx.client.findFirst({
        where: { id: clientId, organizationId: orgId },
      });
      if (!client) throw new DomainError(INVALID_LINK);
      await tx.client.update({
        where: { id: clientId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          addressLine1: data.addressLine1 ?? null,
          addressLine2: data.addressLine2 ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          postalCode: data.postalCode ?? null,
        },
      });
    } else {
      const { code } = await nextClientCode(tx, orgId);
      const client = await tx.client.create({
        data: {
          organizationId: orgId,
          clientCode: code,
          firstName: data.firstName,
          lastName: data.lastName ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          addressLine1: data.addressLine1 ?? null,
          addressLine2: data.addressLine2 ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          postalCode: data.postalCode ?? null,
          source: "intake",
        },
      });
      clientId = client.id;
    }

    const payloadJson =
      data.payload && Object.keys(data.payload).length > 0
        ? (data.payload as Prisma.InputJsonValue)
        : undefined;

    const submission = await tx.intakeSubmission.create({
      data: {
        organizationId: orgId,
        intakeLinkId: link.id,
        clientId,
        caseId: link.caseId,
        payloadJson,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
      },
    });

    await tx.consentRecord.create({
      data: {
        organizationId: orgId,
        clientId,
        caseId: link.caseId,
        consentType: data.consent.consentType,
        version: data.consent.version,
        textHash: data.consent.textHash,
        signerName: data.consent.signerName ?? null,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
      },
    });

    // Documentos subidos vía upload-url del intake (storageKey de la org).
    const expectedPrefix = `org/${orgId}/documents/`;
    let intakeServiceCaseId: string | null = null;
    if (link.caseId) {
      const creditCase = await tx.creditCase.findFirst({
        where: { id: link.caseId, organizationId: orgId },
        select: { serviceCaseId: true },
      });
      intakeServiceCaseId = creditCase?.serviceCaseId ?? null;
    }
    for (const doc of data.documents ?? []) {
      if (!doc.storageKey.startsWith(expectedPrefix)) continue;
      await tx.document.create({
        data: {
          organizationId: orgId,
          clientId,
          caseId: link.caseId,
          serviceCaseId: intakeServiceCaseId,
          category: doc.category ?? "OTHER",
          sensitivity: "CONFIDENTIAL",
          originalName: doc.originalName.slice(0, 255),
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          storageKey: doc.storageKey,
          checksumSha256: doc.checksumSha256 ?? null,
          uploadedById: null,
        },
      });
    }

    await tx.intakeLink.update({
      where: { id: link.id },
      data: { useCount: { increment: 1 } },
    });

    await writeAuditLog(
      {
        organizationId: orgId,
        actorUserId: null,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
      },
      {
        action: "INTAKE_SUBMITTED",
        entityType: "IntakeSubmission",
        entityId: submission.id,
        metadata: { clientId, linkId: link.id },
      },
      tx,
    );

    return { submissionId: submission.id, clientId };
  });
}

/** URL firmada PUT para el intake (misma whitelist MIME/tamaño). */
export async function requestIntakeUploadUrl(
  link: IntakeLinkInfo,
  file: { originalName: string; mimeType: string; sizeBytes: number },
) {
  if (!isStorageConfigured()) {
    throw new DomainError("La carga de archivos no está disponible por ahora.");
  }
  assertFileAllowed(file.mimeType, file.sizeBytes);
  const storageKey = buildStorageKey(link.organizationId, crypto.randomUUID());
  const upload = await createPresignedUploadUrl({
    storageKey,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
  });
  return { url: upload.url, storageKey, expiresInSeconds: upload.expiresInSeconds };
}

/**
 * Subida vía servidor (browser → API → R2).
 * Evita CORS del bucket; misma whitelist MIME/tamaño.
 */
export async function uploadIntakeFile(
  link: IntakeLinkInfo,
  file: { originalName: string; mimeType: string; body: Uint8Array },
) {
  if (!isStorageConfigured()) {
    throw new DomainError("La carga de archivos no está disponible por ahora.");
  }
  assertFileAllowed(file.mimeType, file.body.byteLength);
  const storageKey = buildStorageKey(link.organizationId, crypto.randomUUID());
  await putObjectBytes({
    storageKey,
    mimeType: file.mimeType,
    body: file.body,
  });
  return {
    storageKey,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.body.byteLength,
  };
}
