import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertAllowedFile } from "./policy";

/**
 * Capa S3-compatible para el bucket privado de documentos.
 *
 * Degrada con gracia: si las variables S3_* no están configuradas,
 * isStorageConfigured() devuelve false y las operaciones lanzan un error
 * descriptivo en lugar de fallar de forma opaca.
 */

const PRESIGN_EXPIRES_SECONDS = 5 * 60; // expiración corta: 5 minutos

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
}

function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      "El almacenamiento S3 no está configurado. Define S3_ENDPOINT, S3_BUCKET, " +
        "S3_ACCESS_KEY_ID y S3_SECRET_ACCESS_KEY para habilitar documentos.",
    );
  }
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
    },
  });
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET no está configurado.");
  return bucket;
}

export interface PresignedUpload {
  url: string;
  storageKey: string;
  expiresInSeconds: number;
}

export async function createPresignedUploadUrl(input: {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<PresignedUpload> {
  assertAllowedFile(input.mimeType, input.sizeBytes);
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: input.storageKey,
    ContentType: input.mimeType,
    ContentLength: input.sizeBytes,
  });
  const url = await getSignedUrl(getClient(), command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  });
  return {
    url,
    storageKey: input.storageKey,
    expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
  };
}

export async function createPresignedDownloadUrl(input: {
  storageKey: string;
  /** Nombre sugerido de descarga, sin PII obligatoria. */
  downloadName?: string;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: input.storageKey,
    ...(input.downloadName
      ? { ResponseContentDisposition: `attachment; filename="${input.downloadName.replace(/[^\w.\- ]/g, "_")}"` }
      : {}),
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  });
}
