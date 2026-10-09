/**
 * PR-SEC-PII — redactar PII de texto de buró antes de enviarlo a un modelo.
 * No envía bytes de PDF; solo limpia el string que viajaría en el prompt.
 */
import { sanitizeTextForAI } from "@/src/lib/ai/sanitize";

const DOB_LABELED =
  /\b(DOB|Date of Birth|Fecha de nacimiento|Birth\s*Date)\s*[:#]?\s*(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi;

/** SSN/ITIN etiquetado, incluso last4 o parcialmente enmascarado. */
const SSN_LABELED =
  /\b(SSN|ITIN|Social Security(?:\s*Number)?)\s*[:#]?\s*[Xx*\d-]{3,15}\b/gi;

/** Números de cuenta largos (no scores FICO de 3 dígitos). */
const ACCOUNT_LONG = /\b\d{8,17}\b/g;

/**
 * Enmascara SSN, DOB etiquetado y números de cuenta en texto de reporte.
 * Usa también sanitizeTextForAI para patrones 123-45-6789 y 9 dígitos seguidos.
 */
export function redactBureauText(text: string): string {
  let out = sanitizeTextForAI(text);
  out = out.replace(DOB_LABELED, "$1: [REDACTED]");
  out = out.replace(SSN_LABELED, "$1: [REDACTED]");
  out = out.replace(ACCOUNT_LONG, "[ACCOUNT]");
  return out;
}
