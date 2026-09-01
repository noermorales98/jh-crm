import crypto from "node:crypto";

/**
 * Cifrado de campos sensibles (SSN, fecha de nacimiento, etc.) con AES-256-GCM.
 * Formato versionado: `v1:<iv>:<tag>:<data>` (todo en base64).
 *
 * La clave vive fuera de la BD en FIELD_ENCRYPTION_KEY (base64 de 32 bytes).
 * No cambiarla sin un plan de re-encriptación.
 */

const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY no está configurada. Genera una con `openssl rand -base64 32`.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY debe ser una clave base64 de 32 bytes (AES-256).",
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    data.toString("base64"),
  ].join(":");
}

export function decrypt(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Payload cifrado con formato no reconocido.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** ***-**-1234 — nunca mostrar el SSN completo en listados ni logs. */
export function maskSSN(ssnOrLast4: string): string {
  const digits = ssnOrLast4.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  if (last4.length !== 4) {
    throw new Error("No se pudo enmascarar el SSN: faltan dígitos.");
  }
  return `***-**-${last4}`;
}

export function ssnLast4(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length !== 9) {
    throw new Error("SSN inválido: se esperaban 9 dígitos.");
  }
  return digits.slice(-4);
}
