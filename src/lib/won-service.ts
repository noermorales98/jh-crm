import {
  assertServiceCode,
  isServiceCode,
  type ServiceCode,
} from "@/src/server/services/codes";

/**
 * Resuelve vertical para WON: selector explícito > serviceRequested > CREDIT_REPAIR.
 * Seguro para uso en cliente y servidor (sin Prisma).
 */
export function resolveWonServiceCode(
  explicit?: string | null,
  serviceRequested?: string | null,
): ServiceCode {
  if (explicit) {
    if (!isServiceCode(explicit)) {
      throw new Error("Servicio inválido para la conversión.");
    }
    return assertServiceCode(explicit);
  }
  const raw = (serviceRequested ?? "").trim();
  if (!raw) return "CREDIT_REPAIR";
  const asCode = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (isServiceCode(asCode)) return asCode;

  const lower = raw.toLowerCase();
  if (/casa|home|vivienda|comprar casa|home.?buyer/.test(lower)) {
    return "HOME_BUYER";
  }
  if (/negocio|business|funding|fondeo|financiamiento/.test(lower)) {
    return "BUSINESS_CREDIT";
  }
  if (/pr[eé]stamo personal|personal.?loan/.test(lower)) {
    return "PERSONAL_LOAN";
  }
  if (/desarrollo web|web development|landing|sitio web/.test(lower)) {
    return "WEB_DEVELOPMENT";
  }
  if (/\bcrm\b|desarrollo crm/.test(lower)) {
    return "CRM_DEVELOPMENT";
  }
  if (/cr[eé]dito|credit.?repair|reparaci[oó]n/.test(lower)) {
    return "CREDIT_REPAIR";
  }
  return "CREDIT_REPAIR";
}
