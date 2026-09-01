import { format, formatDistanceToNow, isPast, addDays } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Fechas conscientes de zona horaria.
 * La organización opera por defecto en America/Chicago (ver OrganizationSettings).
 */

export const DEFAULT_TIMEZONE = "America/Chicago";

export function formatDate(date: Date | string, timezone = DEFAULT_TIMEZONE): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-US", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(d);
}

export function formatDateTime(
  date: Date | string,
  timezone = DEFAULT_TIMEZONE,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(d);
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: es });
}

export function formatForPdf(date: Date | string, timezone = DEFAULT_TIMEZONE): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(
    new Date(d.toLocaleString("en-US", { timeZone: timezone })),
    "MM/dd/yyyy",
  );
}

export { isPast, addDays };

/**
 * Rango [start, end) UTC del día calendario de `date` en `timezone`.
 * Útil para filtros "hoy" / "esta semana" conscientes de la zona horaria
 * de la organización (America/Chicago por defecto).
 */
export function zonedDayRange(
  date: Date,
  timezone = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const dayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // YYYY-MM-DD en la zona horaria dada
  const guessUtc = new Date(`${dayStr}T00:00:00.000Z`);
  const asInZone = new Date(
    guessUtc.toLocaleString("en-US", { timeZone: timezone }),
  );
  const offsetMs = asInZone.getTime() - guessUtc.getTime();
  const start = new Date(guessUtc.getTime() - offsetMs);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
