import { sanitizeForAI, sanitizeTextForAI } from "@/src/lib/ai/sanitize";

/**
 * Limpieza del conector (AC-6), encima de la del asistente interno. Se aplica a todo lo
 * que sale hacia Claude, pero solo en texto libre: los campos que son identificadores,
 * enlaces, códigos o teléfonos se dejan intactos para no estropear datos legítimos.
 *
 * - Series de 11 o más dígitos (cuentas, tarjetas), con separadores entre medias (hasta
 *   6 espacios, saltos de línea, puntos, guiones, barras o guiones bajos), pegadas a letras
 *   o escritas con dígitos de ancho completo: se dejan solo los 4 últimos.
 * - SSN/ITIN de 9 dígitos con o sin separadores (123-45-6789, 123 45 6789, 123.45.6789,
 *   123456789, ssn_123456789): se tapan enteros.
 */

const LONG_DIGIT_RUN = /(?<!\d)\d(?:[\s._/-]{0,6}\d){10,}(?!\d)/g;
const SSN_LIKE = /(?<!\d)\d{3}[\s._-]{0,3}\d{2}[\s._-]{0,3}\d{4}(?!\d)/g;

/**
 * Campos que no son texto libre: se devuelven tal cual. Lista exacta (más ids y enlaces):
 * una clave nueva se limpia por defecto, nunca se exime por parecerse a otra.
 */
const VERBATIM_KEY = /^(id|href|code|clientCode|folio|caseCode|caseNumber|phone|whatsappNumber|email|status|stage|kind|type|priority|category|sensitivity)$|[a-z](Id|Href)$/;

export function maskSensitiveText(raw: string): string {
  // NFKC convierte dígitos de ancho completo (０-９) en dígitos normales antes de buscar.
  return raw
    .normalize("NFKC")
    .replace(LONG_DIGIT_RUN, (match) => `****${match.replace(/\D/g, "").slice(-4)}`)
    .replace(SSN_LIKE, "***-**-****");
}

/** Compatibilidad: nombre anterior. */
export const maskLongNumbers = maskSensitiveText;

const HREF_KEY = /^href$|[a-z]Href$/;

/**
 * Los enlaces internos salen como rutas (`/crm/clientes/…`). Claude los abre desde su
 * propia web, así que una ruta suelta acabaría en claude.ai: se les antepone la dirección
 * pública del CRM. Sin NEXT_PUBLIC_APP_URL se dejan como están.
 */
export function absoluteHref(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}${href}` : href;
}

function walk(value: unknown, key: string | null): unknown {
  if (typeof value === "string") {
    if (key !== null && HREF_KEY.test(key)) return absoluteHref(value);
    return key !== null && VERBATIM_KEY.test(key) ? value : maskSensitiveText(value);
  }
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
 * ¿Es una búsqueda por un número que podría ser sensible? Se rechazan 9 dígitos (SSN/ITIN)
 * y 13 o más (tarjetas, cuentas largas): buscar por ellos serviría para adivinarlos por
 * coincidencia. Se permiten códigos y teléfonos, también con prefijo de país (hasta 12).
 */
export function isSensitiveNumberQuery(query: string): boolean {
  const digits = query.normalize("NFKC").replace(/\D/g, "").length;
  return digits === 9 || digits >= 13;
}
