import crypto from "node:crypto";

/**
 * Tokens aleatorios criptográficamente seguros para enlaces públicos
 * (intake), invitaciones y cualquier identificador opaco.
 */

/** Token URL-safe de 32 bytes de entropía (base64url, ~43 chars). */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Token hexadecimal (útil para debugging/identificadores cortos). */
export function generateHexToken(bytes = 16): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/** Comparación en tiempo constante (p. ej. para CRON_SECRET). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
