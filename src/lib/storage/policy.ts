/**
 * Política de archivos para documentos del CRM.
 * Primera versión: solo PDF/JPG/PNG, límite configurable por UPLOAD_MAX_MB.
 */

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function getUploadMaxBytes(): number {
  const mb = Number(process.env.UPLOAD_MAX_MB ?? "15");
  if (!Number.isFinite(mb) || mb <= 0) return 15 * 1024 * 1024;
  return Math.floor(mb * 1024 * 1024);
}

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isAllowedSize(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= getUploadMaxBytes();
}

export function assertAllowedFile(mimeType: string, sizeBytes: number): void {
  if (!isAllowedMimeType(mimeType)) {
    throw new Error(
      `Tipo de archivo no permitido: ${mimeType}. Solo PDF, JPG y PNG.`,
    );
  }
  if (!isAllowedSize(sizeBytes)) {
    throw new Error(
      `El archivo excede el límite de ${process.env.UPLOAD_MAX_MB ?? "15"} MB.`,
    );
  }
}

/**
 * storageKey sin PII: org/<orgId>/documents/<uuid>.
 * Nunca incluir nombre, SSN, email ni teléfono.
 */
export function buildStorageKey(organizationId: string, uuid: string): string {
  return `org/${organizationId}/documents/${uuid}`;
}
