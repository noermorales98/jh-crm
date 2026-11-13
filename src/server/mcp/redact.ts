import { sanitizeForAI, sanitizeTextForAI } from "@/src/lib/ai/sanitize";

/**
 * Limpieza del conector (AC-6), encima de la del asistente interno. Se aplica a todo lo
 * que sale hacia Claude, pero solo en texto libre: los campos que son identificadores,
 * enlaces, códigos o teléfonos se dejan intactos para no estropear datos legítimos.
 *
 * - Series de 12 o más dígitos (cuentas, tarjetas), con cualquier separador corto entre
 *   medias (espacio, salto de línea, punto, guion, barra, guion bajo) o pegadas a letras:
 *   se dejan solo los 4 últimos.
 * - SSN/ITIN de 9 dígitos con o sin separadores (123-45-6789, 123 45 6789, 123.45.6789,
 *   123456789, ssn_123456789): se tapan enteros.
 */

const LONG_DIGIT_RUN = /(?<!\d)\d(?:[\s._/-]{0,3}\d){11,}(?!\d)/g;
const SSN_LIKE = /(?<!\d)\d{3}[\s._-]{0,2}\d{2}[\s._-]{0,2}\d{4}(?!\d)/g;

/** Campos que no son texto libre: se devuelven tal cual. */
const VERBATIM_KEY = /^(id|href|code|clientCode|folio|caseCode|caseNumber|phone|phones|whatsapp|whatsappNumber|email|status|stage|kind|type|priority|category|sensitivity)$|(Id|Href|At|Code)$/;

export function maskSensitiveText(text: string): string {
  return text
    .replace(LONG_DIGIT_RUN, (match) => `****${match.replace(/\D/g, "").slice(-4)}`)
    .replace(SSN_LIKE, "***-**-****");
}

/** Compatibilidad: nombre anterior. */
export const maskLongNumbers = maskSensitiveText;

function walk(value: unknown, key: string | null): unknown {
  if (typeof value === "string") return key !== null && VERBATIM_KEY.test(key) ? value : maskSensitiveText(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, key));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v, k);
    return out;
  }
  return value;
}

/** Todo lo que sale del conector hacia Claude pasa por aquí. */
export function redactForClaude<T>(value: T): T {
  return walk(sanitizeForAI(value), null) as T;
}

export function redactTextForClaude(text: string): string {
  return maskSensitiveText(sanitizeTextForAI(text));
}

/**
 * ¿Es una búsqueda por un número que podría ser sensible? Se permiten códigos cortos
 * (hasta 8 dígitos) y teléfonos de 10 dígitos; se rechazan 9 dígitos (SSN/ITIN) y 11 o
 * más (cuentas, tarjetas): buscar por ellos serviría para adivinarlos por coincidencia.
 */
export function isSensitiveNumberQuery(query: string): boolean {
  const digits = query.replace(/\D/g, "").length;
  return digits === 9 || digits >= 11;
}
