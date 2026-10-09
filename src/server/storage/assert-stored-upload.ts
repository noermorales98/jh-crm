/**
 * PR-DC-CONFIRM — comprobar objeto en S3 antes de crear Document.
 */
import {
  deleteObject,
  headObjectMeta,
  isStorageConfigured,
} from "@/src/lib/storage/s3";
import { getUploadMaxBytes } from "@/src/lib/storage/policy";
import { DomainError } from "@/src/server/errors";

function normalizeMime(mime: string): string {
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * HeadObject + reglas de tamaño/MIME. Si falla, intenta borrar el objeto
 * (best-effort) y lanza DomainError. No crea filas Document.
 */
export async function assertStoredObjectMatchesClaim(input: {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ sizeBytes: number }> {
  if (!isStorageConfigured()) {
    throw new DomainError(
      "El almacenamiento no está configurado. No se puede confirmar el archivo.",
    );
  }

  const meta = await headObjectMeta(input.storageKey);
  if (!meta) {
    await bestEffortDelete(input.storageKey);
    throw new DomainError(
      "El archivo no se encontró en el almacenamiento. Vuelve a subirlo.",
    );
  }

  const max = getUploadMaxBytes();
  if (meta.contentLength > max) {
    await bestEffortDelete(input.storageKey);
    throw new DomainError(
      `El archivo excede el límite de ${process.env.UPLOAD_MAX_MB ?? "15"} MB.`,
    );
  }

  if (meta.contentLength !== input.sizeBytes) {
    await bestEffortDelete(input.storageKey);
    throw new DomainError(
      "El tamaño del archivo en el almacenamiento no coincide con el declarado. Vuelve a subirlo.",
    );
  }

  if (meta.contentType) {
    const claimed = normalizeMime(input.mimeType);
    const stored = normalizeMime(meta.contentType);
    if (claimed && stored && claimed !== stored) {
      await bestEffortDelete(input.storageKey);
      throw new DomainError(
        "El tipo de archivo en el almacenamiento no coincide con el declarado.",
      );
    }
  }

  return { sizeBytes: meta.contentLength };
}

async function bestEffortDelete(storageKey: string): Promise<void> {
  try {
    if (storageKey && !storageKey.startsWith("purged/")) {
      await deleteObject(storageKey);
    }
  } catch (error) {
    console.error("[storage] deleteObject tras confirm fallido:", error);
  }
}
