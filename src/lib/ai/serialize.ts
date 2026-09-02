import { DEFAULT_TIMEZONE } from "@/src/lib/format/dates";
import { formatAiDateTime, isIsoDateString } from "@/src/lib/ai/dates";

/** Convierte valores de Prisma/Date a JSON plano para las herramientas de IA. */

function isDecimalLike(value: object): boolean {
  const name = value.constructor?.name;
  return name === "Decimal" || name === "PrismaDecimal";
}

export function jsonSafe(
  value: unknown,
  timezone = DEFAULT_TIMEZONE,
): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return formatAiDateTime(value, timezone);
  if (typeof value === "string" && isIsoDateString(value)) {
    return formatAiDateTime(value, timezone);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    if (isDecimalLike(value)) return String(value);
    if (Array.isArray(value)) return value.map((item) => jsonSafe(item, timezone));
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = jsonSafe(nested, timezone);
    }
    return out;
  }
  return value;
}

export function fullName(person: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}): string {
  if (person.name) return person.name;
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
}
