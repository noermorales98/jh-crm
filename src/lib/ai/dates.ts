import { DEFAULT_TIMEZONE } from "@/src/lib/format/dates";

const MONTHS = [
  "",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function zonedParts(date: Date, timezone: string) {
  const map: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function formatClock(hour: number, minute: number): string {
  const hour12 = hour % 12 || 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** Fecha: "31 de agosto del 2026". */
export function formatAiDate(
  date: Date | string,
  timezone = DEFAULT_TIMEZONE,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return String(date);
  const { year, month, day } = zonedParts(d, timezone);
  const monthWord = MONTHS[month] ?? String(month);
  return `${day} de ${monthWord} del ${year}`;
}

/**
 * Fecha; si hay hora distinta de medianoche, añade hora.
 * "31 de agosto del 2026, 7:00PM"
 */
export function formatAiDateTime(
  date: Date | string,
  timezone = DEFAULT_TIMEZONE,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return String(date);
  const written = formatAiDate(d, timezone);
  const { hour, minute } = zonedParts(d, timezone);
  if (hour === 0 && minute === 0) return written;
  return `${written}, ${formatClock(hour, minute)}`;
}

export function isIsoDateString(value: string): boolean {
  return ISO_DATE_RE.test(value);
}
