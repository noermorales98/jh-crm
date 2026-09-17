import {
  DeleteObjectCommand,
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
  const endpoint = process.env.S3_ENDPOINT as string;
  const isR2 = /r2\.cloudflarestorage\.com$/i.test(
    (() => {
      try {
        return new URL(endpoint).hostname;
      } catch {
        return "";
      }
    })(),
  );
  // R2: path-style evita bucket duplicado en host+path y mejora CORS del PUT.
  const forcePathStyle =
    process.env.S3_FORCE_PATH_STYLE === "true" ||
    (process.env.S3_FORCE_PATH_STYLE !== "false" && isR2);

  return new S3Client({
    endpoint,
    region: process.env.S3_REGION || "auto",
    forcePathStyle,
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
    // No firmar ContentLength: el browser PUT falla por CORS/firma si no
    // coincide exactamente; el tamaño ya se validó en assertAllowedFile.
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

const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * Nombre seguro para Content-Disposition, siempre con extensión según mime.
 * Evita descargas sin ".pdf" que el SO/navegador no abre como PDF.
 */
export function buildDownloadFilename(
  name: string,
  mimeType?: string,
): string {
  const ext = mimeType ? (MIME_EXTENSIONS[mimeType] ?? "") : "";
  let base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!base) base = "documento";
  if (ext && !base.toLowerCase().endsWith(ext)) {
    base = `${base}${ext}`;
  }
  return base;
}

export async function createPresignedDownloadUrl(input: {
  storageKey: string;
  /** Nombre sugerido de descarga, sin PII obligatoria. */
  downloadName?: string;
  mimeType?: string;
  /** inline = previsualizar en el navegador; attachment = forzar descarga. */
  disposition?: "attachment" | "inline";
}): Promise<string> {
  const disposition = input.disposition ?? "attachment";
  const filename = input.downloadName
    ? buildDownloadFilename(input.downloadName, input.mimeType)
    : undefined;
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: input.storageKey,
    ...(filename
      ? {
          ResponseContentDisposition: `${disposition}; filename="${filename}"`,
        }
      : {}),
    ...(input.mimeType ? { ResponseContentType: input.mimeType } : {}),
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  });
}

/** Lee bytes del objeto (server-side; p.ej. importación PDF). */
export async function getObjectBytes(storageKey: string): Promise<Buffer> {
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: storageKey,
    }),
  );
  const body = response.Body;
  if (!body) {
    throw new Error("El objeto S3 no tiene cuerpo.");
  }
  const bytes = await body.transformToByteArray();
  return Buffer.from(bytes);
}

/** Elimina un objeto del bucket (hard delete / retención). */
export async function deleteObject(storageKey: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: storageKey,
    }),
  );
}

/** Subida server-side (evita CORS del browser → R2). */
export async function putObjectBytes(input: {
  storageKey: string;
  mimeType: string;
  body: Buffer | Uint8Array;
}): Promise<void> {
  assertAllowedFile(input.mimeType, input.body.byteLength);
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: input.storageKey,
      ContentType: input.mimeType,
      Body: input.body,
      ContentLength: input.body.byteLength,
    }),
  );
}
