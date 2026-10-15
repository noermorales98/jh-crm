/**
 * Elige el camino de subida CRM según el tamaño del archivo.
 * Same-origin evita CORS; PUT firmado evita el body máximo de Vercel (~4.5 MB).
 */
import { SAME_ORIGIN_UPLOAD_MAX_BYTES } from "@/src/lib/storage/policy";

export type CrmUploadStrategy = "same-origin" | "presigned";

export function chooseCrmUploadStrategy(sizeBytes: number): CrmUploadStrategy {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "same-origin";
  }
  return sizeBytes >= SAME_ORIGIN_UPLOAD_MAX_BYTES ? "presigned" : "same-origin";
}

export { SAME_ORIGIN_UPLOAD_MAX_BYTES };
