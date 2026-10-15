/**
 * Política de archivos para documentos del CRM.
 * Primera versión: solo PDF/JPG/PNG, límite configurable por UPLOAD_MAX_MB.
 * CREDIT_REPORT / UPDATE_REPORT: tope 12 MB (alineado con el analizador PDF).
 */

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Categorías cuyo tope coincide con el del analizador de crédito (12 MB). */
export const CREDIT_REPORT_UPLOAD_CATEGORIES = [
  "CREDIT_REPORT",
  "UPDATE_REPORT",
] as const;

export type CreditReportUploadCategory =
  (typeof CREDIT_REPORT_UPLOAD_CATEGORIES)[number];

/** Tope del analizador de PDF de crédito (jobs / analyzeCreditPdf). */
export const CREDIT_REPORT_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

/**
 * Umbral para elegir same-origin vs PUT firmado.
 * Debe quedar por debajo del body máximo de Vercel Functions (~4.5 MB).
 */
export const SAME_ORIGIN_UPLOAD_MAX_BYTES = 4_000_000;

export function getUploadMaxBytes(): number {
  const mb = Number(process.env.UPLOAD_MAX_MB ?? "15");
  if (!Number.isFinite(mb) || mb <= 0) return 15 * 1024 * 1024;
  return Math.floor(mb * 1024 * 1024);
}

export function isCreditReportUploadCategory(
  category: string | null | undefined,
): category is CreditReportUploadCategory {
  return (
    typeof category === "string" &&
    (CREDIT_REPORT_UPLOAD_CATEGORIES as readonly string[]).includes(category)
  );
}

/** Tope por categoría: reportes de crédito 12 MB; resto UPLOAD_MAX_MB. */
export function getUploadMaxBytesForCategory(
  category?: string | null,
): number {
  if (isCreditReportUploadCategory(category)) {
    return Math.min(CREDIT_REPORT_UPLOAD_MAX_BYTES, getUploadMaxBytes());
  }
  return getUploadMaxBytes();
}

export function formatUploadMaxMb(maxBytes: number): string {
  const mb = maxBytes / (1024 * 1024);
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
}

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isAllowedSize(
  sizeBytes: number,
  category?: string | null,
): boolean {
  return sizeBytes > 0 && sizeBytes <= getUploadMaxBytesForCategory(category);
}

export function assertAllowedFile(
  mimeType: string,
  sizeBytes: number,
  category?: string | null,
): void {
  if (!isAllowedMimeType(mimeType)) {
    throw new Error(
      `Tipo de archivo no permitido: ${mimeType}. Solo PDF, JPG y PNG.`,
    );
  }
  const max = getUploadMaxBytesForCategory(category);
  if (sizeBytes <= 0 || sizeBytes > max) {
    throw new Error(
      `El archivo excede el límite de ${formatUploadMaxMb(max)} MB.`,
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
