import { sanitizeForAI, sanitizeTextForAI } from "@/src/lib/ai/sanitize";

/**
 * Limpieza extra del conector (AC-6), encima de la del asistente interno: cualquier
 * serie de 12 o más dígitos (cuentas, tarjetas), con espacios o guiones entre medias,
 * se enmascara dejando los 4 últimos. Los teléfonos (10 dígitos) no se tocan.
 */
const LONG_DIGIT_RUN = /\b\d(?:[ -]?\d){11,}\b/g;

export function maskLongNumbers(text: string): string {
  return text.replace(LONG_DIGIT_RUN, (match) => {
    const digits = match.replace(/\D/g, "");
    return `****${digits.slice(-4)}`;
  });
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return maskLongNumbers(value);
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v);
    return out;
  }
  return value;
}

/** Todo lo que sale del conector hacia Claude pasa por aquí. */
export function redactForClaude<T>(value: T): T {
  return walk(sanitizeForAI(value)) as T;
}

export function redactTextForClaude(text: string): string {
  return maskLongNumbers(sanitizeTextForAI(text));
}
