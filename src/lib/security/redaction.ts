/**
 * Helpers para no exponer PII en logs ni metadata de auditoría.
 *
 * Reglas del proyecto: SSN, fecha de nacimiento, direcciones completas y
 * documentos nunca se escriben en logs, metadata ni URLs.
 */

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***-***-${digits.slice(-4)}`;
}

/** Redacta valores sensibles conocidos dentro de un objeto para logging. */
const SENSITIVE_KEYS = new Set([
  "ssn",
  "ssnEncrypted",
  "ssnLast4",
  "dateOfBirth",
  "dateOfBirthEncrypted",
  "driversLicenseNumber",
  "driversLicenseNumberEncrypted",
  "sensitiveNotes",
  "sensitiveNotesEncrypted",
  "password",
  "passwordHash",
  "token",
  "authorization",
  "apikey",
  "apiKey",
  "callmebotApiKey",
  "callmebotApiKeyEncrypted",
  "apiKeyEncrypted",
  "whapiToken",
  "whapiTokenEncrypted",
  "stripeSecretKey",
  "stripeSecretKeyEncrypted",
  "stripeWebhookSecret",
  "stripeWebhookSecretEncrypted",
  "mfaSecret",
  "mfaSecretEncrypted",
  "mfaRecoveryCodes",
  "mfaRecoveryCodesEncrypted",
  "otpauthUri",
  "recoveryCodes",
]);

export function redactForLog<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : redactForLog(val);
    }
    return out as T;
  }
  return value;
}

/** Metadata segura para AuditLog/ActivityLog: elimina claves sensibles. */
export function safeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return redactForLog(metadata);
}
