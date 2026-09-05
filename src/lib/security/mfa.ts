import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Secret, TOTP } from "otpauth";

/**
 * Utilidades TOTP / códigos de recuperación MFA.
 * Los secretos se cifran en la capa de servicio con encrypt().
 */

export const MFA_ISSUER = "J&H CRM";
export const MFA_RECOVERY_CODE_COUNT = 10;
export const MFA_MAX_FAILED_ATTEMPTS = 5;
export const MFA_LOCK_MINUTES = 15;

/** Genera un secreto TOTP (base32) listo para otpauth. */
export function generateTotpSecret(): { secret: Secret; base32: string } {
  const secret = new Secret({ size: 20 });
  return { secret, base32: secret.base32 };
}

export function buildOtpauthUri(input: {
  secret: Secret | string;
  accountName: string;
  issuer?: string;
}): string {
  const secret =
    typeof input.secret === "string"
      ? Secret.fromBase32(input.secret)
      : input.secret;
  const totp = new TOTP({
    issuer: input.issuer ?? MFA_ISSUER,
    label: input.accountName,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return totp.toString();
}

/** Valida un código TOTP de 6 dígitos (±1 ventana). */
export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  const totp = new TOTP({
    issuer: MFA_ISSUER,
    label: "verify",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

/** 10 códigos alfanuméricos en claro (solo se muestran una vez). */
export function generateRecoveryCodes(
  count = MFA_RECOVERY_CODE_COUNT,
): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    codes.push(crypto.randomBytes(5).toString("hex"));
  }
  return codes;
}

/** Hashea códigos de recuperación con bcrypt (para almacenar cifrados como JSON). */
export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(normalizeRecoveryCode(code), 10)));
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/\s/g, "").toLowerCase();
}

/**
 * Comprueba un código de recuperación contra hashes bcrypt.
 * Devuelve el índice coincidente o -1.
 */
export async function matchRecoveryCode(
  code: string,
  hashes: string[],
): Promise<number> {
  const normalized = normalizeRecoveryCode(code);
  for (let i = 0; i < hashes.length; i += 1) {
    if (await bcrypt.compare(normalized, hashes[i])) return i;
  }
  return -1;
}
