/**
 * PR-SEC-PII / JH-007 — redactar PII de texto de buró y nombres de archivo
 * antes de enviarlos a un modelo. No envía bytes de PDF.
 */
import { sanitizeTextForAI } from "@/src/lib/ai/sanitize";

const DOB_LABELED =
  /\b(DOB|Date of Birth|Fecha de nacimiento|Birth\s*Date)\s*[:#]?\s*(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi;

/** SSN/ITIN etiquetado, incluso last4 o parcialmente enmascarado. */
const SSN_LABELED =
  /\b(SSN|ITIN|Social Security(?:\s*Number)?)\s*[:#]?\s*[Xx*\d\-\s]{3,18}\b/gi;

/** SSN con espacios: 123 45 6789 */
const SSN_SPACED = /\b\d{3}\s\d{2}\s\d{4}\b/g;

/** Emails (pueden aparecer en reportes / filenames). */
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/** Teléfono US común 10 dígitos con separadores opcionales. */
const PHONE_US =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;

/** Números de cuenta largos (no scores FICO de 3 dígitos). */
const ACCOUNT_LONG = /\b\d{8,17}\b/g;

/** SSN dashed sin exigir word-boundary (filenames con `_123-45-6789_`). */
const SSN_DASHED_LOOSE = /\d{3}-\d{2}-\d{4}/g;
/** 9 dígitos seguidos en filenames / tokens. */
const SSN_BARE_LOOSE = /\d{9}/g;

/**
 * Enmascara SSN, DOB etiquetado, emails, teléfonos y cuentas en texto de reporte.
 * Usa también sanitizeTextForAI para patrones 123-45-6789 y 9 dígitos seguidos.
 */
export function redactBureauText(text: string): string {
  let out = sanitizeTextForAI(text);
  out = out.replace(SSN_SPACED, "***-**-****");
  out = out.replace(DOB_LABELED, "$1: [REDACTED]");
  out = out.replace(SSN_LABELED, "$1: [REDACTED]");
  out = out.replace(EMAIL, "[EMAIL]");
  out = out.replace(PHONE_US, "[PHONE]");
  // Cuentas largas antes que SSN bare de 9 dígitos (evita partir números de 14).
  out = out.replace(ACCOUNT_LONG, "[ACCOUNT]");
  out = out.replace(SSN_DASHED_LOOSE, "***-**-****");
  out = out.replace(SSN_BARE_LOOSE, "***-**-****");
  return out;
}

/**
 * Limpia el nombre de archivo antes de incluirlo en un prompt.
 * Conserva extensión corta (.pdf) y un prefijo seguro.
 */
export function sanitizeFileNameForAI(fileName: string): string {
  const trimmed = fileName.trim() || "document.pdf";
  const lastDot = trimmed.lastIndexOf(".");
  const ext =
    lastDot > 0 && trimmed.length - lastDot <= 5
      ? trimmed.slice(lastDot).toLowerCase().replace(/[^a-z0-9.]/g, "")
      : "";
  const base = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  // Separators → spaces so word-boundary patterns and phones also match.
  const normalized = base.replace(/[_\-.]+/g, " ");
  const redactedBase = redactBureauText(normalized)
    .replace(/[^\w.\-\[\] ]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  const safe = redactedBase.length > 0 ? redactedBase : "document";
  return `${safe}${ext || ".pdf"}`;
}
