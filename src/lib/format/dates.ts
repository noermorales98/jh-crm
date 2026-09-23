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

export type TaskDueBucket = "overdue" | "today" | "week" | "later" | "none";

/** Día calendario (YYYY-MM-DD) de `date` en `timezone`. */
export function ymdInZone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Suma días de calendario a un YYYY-MM-DD (aritmética UTC de fecha civil). */
function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/**
 * Offset (wall-as-UTC − instant) en `timezone`. No depende de process TZ
 * (a diferencia de new Date(toLocaleString(...))).
 */
function zonedOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * Instant UTC correspondiente a `ymd` a la hora `hour` en `timezone`.
 * El desfase se calcula en la hora pedida (aguanta DST).
 */
export function zonedDateAtHour(
  ymd: string,
  timezone: string,
  hour: number,
): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hour, 0, 0, 0);
  let utcMs = wallAsUtc;
  for (let i = 0; i < 2; i++) {
    const offset = zonedOffsetMs(new Date(utcMs), timezone);
    utcMs = wallAsUtc - offset;
  }
  return new Date(utcMs);
}

/**
 * Mediodía en `timezone` del día calendario `days` días después de `now`
 * (días de calendario, no 24h × n).
 */
export function zonedNoonInDays(
  now: Date,
  timezone: string,
  days: number,
): Date {
  return zonedDateAtHour(
    addCalendarDaysYmd(ymdInZone(now, timezone), days),
    timezone,
    12,
  );
}

/**
 * Rango [start, end) UTC del día calendario de `date` en `timezone`.
 * Útil para filtros "hoy" / "esta semana" conscientes de la zona horaria
 * de la organización (America/Chicago por defecto).
 */
export function zonedDayRange(
  date: Date,
  timezone = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const dayStr = ymdInZone(date, timezone);
  const start = zonedDateAtHour(dayStr, timezone, 0);
  const end = zonedDateAtHour(addCalendarDaysYmd(dayStr, 1), timezone, 0);
  return { start, end };
}

/**
 * Semana operativa [start, end): inicio de hoy → inicio del día 7
 * (zonedDayRange del día +6).end). No suma 7×24h al instante.
 */
export function zonedWeekRange(
  now: Date,
  timezone = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const { start } = zonedDayRange(now, timezone);
  const dayPlus6Ymd = addCalendarDaysYmd(ymdInZone(now, timezone), 6);
  const dayPlus6 = new Date(`${dayPlus6Ymd}T12:00:00.000Z`);
  const { end } = zonedDayRange(dayPlus6, timezone);
  return { start, end };
}

/**
 * Clasifica dueAt respecto al día calendario de la organización.
 * Las categorías no se solapan: overdue < today.start; today ∈ [start, end).
 */
export function classifyTaskDue(
  dueAt: Date | string | null,
  now: Date,
  timezone: string,
): TaskDueBucket {
  if (dueAt == null) return "none";
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  if (Number.isNaN(due.getTime())) return "none";

  const today = zonedDayRange(now, timezone);
  if (due.getTime() < today.start.getTime()) return "overdue";
  if (due.getTime() < today.end.getTime()) return "today";

  const week = zonedWeekRange(now, timezone);
  if (due.getTime() < week.end.getTime()) return "week";
  return "later";
}
