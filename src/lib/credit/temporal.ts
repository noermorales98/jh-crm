/**
 * Antigüedad y consultas al corte del reporte.
 * No usa el reloj de ejecución ni parte un contador en filas.
 */

export const TEMPORAL_VERSION = "t10-2026-10-20";

export type DatePrecision = "DAY" | "MONTH" | "YEAR";

export type CivilDate = {
  year: number;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
};

export type AgeAccount = {
  opened: CivilDate | null;
  closed: boolean;
  authorizedUser: boolean;
};

export type TemporalView = {
  includeClosed: boolean;
  includeAuthorizedUsers: boolean;
};

export type ObservedInquiry = {
  bureau: string | null;
  inquiredOn: string | null;
  kind: string | null;
};

export type TemporalMetrics = {
  asOf: string;
  ageCoverage: { known: number; total: number };
  oldestMonths: number | null;
  newestMonths: number | null;
  averageKnownMonths: number | null;
  hardRawCount: number | null;
  groupedInformationalCount: number | null;
  windowStart: string | null;
  groupingPolicyVersion: string | null;
  legacyInquiryCount: number | null;
};

const DEFAULT_VIEW: TemporalView = {
  includeClosed: false,
  includeAuthorizedUsers: false,
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatCivilDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseCivilDay(value: string | null | undefined): {
  year: number;
  month: number;
  day: number;
} | null {
  if (value == null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function addMonths(
  date: { year: number; month: number; day: number },
  delta: number,
): { year: number; month: number; day: number } {
  const index = date.year * 12 + (date.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function inView(account: AgeAccount, view: TemporalView): boolean {
  if (account.closed && !view.includeClosed) return false;
  if (account.authorizedUser && !view.includeAuthorizedUsers) return false;
  return true;
}

/** Meses civiles. Una precisión de año no alcanza. Una fecha futura no es edad negativa. */
export function ageMonths(opened: CivilDate | null, asOf: string): number | null {
  const end = parseCivilDay(asOf);
  if (opened == null || end == null || opened.month == null) return null;
  if (opened.precision === "YEAR") return null;
  if (opened.year > end.year) return null;
  if (opened.year === end.year && opened.month > end.month) return null;
  if (opened.precision === "MONTH" || opened.day == null) {
    const months = 12 * (end.year - opened.year) + (end.month - opened.month);
    return months < 0 ? null : months;
  }
  if (opened.day < 1 || opened.day > daysInMonth(opened.year, opened.month)) return null;
  if (
    opened.year === end.year &&
    opened.month === end.month &&
    opened.day > end.day
  ) {
    return null;
  }
  const months =
    12 * (end.year - opened.year) +
    (end.month - opened.month) -
    (end.day < opened.day ? 1 : 0);
  return months < 0 ? null : months;
}

function inquiryKind(kind: string | null): "HARD" | "SOFT" | "UNKNOWN" {
  const text = kind?.trim().toUpperCase() ?? "";
  if (text === "HARD" || text === "HARD_INQUIRY") return "HARD";
  if (text === "SOFT" || text === "SOFT_INQUIRY") return "SOFT";
  return "UNKNOWN";
}

export function formatInquiryReading(input: {
  hardRawCount: number | null;
  legacyInquiryCount: number | null;
}): string {
  const { hardRawCount, legacyInquiryCount } = input;
  if (hardRawCount == null && legacyInquiryCount == null) return "Sin dato";
  if (hardRawCount == null) return `${legacyInquiryCount} contador`;
  if (legacyInquiryCount == null) return `${hardRawCount} duras`;
  return `${hardRawCount} duras · ${legacyInquiryCount} contador`;
}

export function temporalMetrics(input: {
  asOf: string;
  accounts: AgeAccount[];
  view?: Partial<TemporalView>;
  inquiries?: ObservedInquiry[] | null;
  windowMonths?: number | null;
  legacyInquiryCount?: number | null;
}): TemporalMetrics {
  const view: TemporalView = { ...DEFAULT_VIEW, ...input.view };
  const universe = input.accounts.filter((account) => inView(account, view));
  const ages = universe
    .map((account) => ageMonths(account.opened, input.asOf))
    .filter((months): months is number => months != null);
  const known = ages.length;
  const end = parseCivilDay(input.asOf);
  const windowMonths = input.windowMonths;
  const windowStart =
    end != null && windowMonths != null && Number.isInteger(windowMonths) && windowMonths >= 0
      ? formatCivilDate(
          addMonths(end, -windowMonths).year,
          addMonths(end, -windowMonths).month,
          addMonths(end, -windowMonths).day,
        )
      : null;

  let hardRawCount: number | null = null;
  if (input.inquiries != null && windowStart != null && end != null) {
    const asOf = formatCivilDate(end.year, end.month, end.day);
    hardRawCount = input.inquiries.filter((inquiry) => {
      if (inquiryKind(inquiry.kind) !== "HARD") return false;
      if (inquiry.bureau == null || inquiry.bureau.trim() === "") return false;
      const on = inquiry.inquiredOn;
      if (on == null || parseCivilDay(on) == null) return false;
      return on >= windowStart && on <= asOf;
    }).length;
  }

  return {
    asOf: input.asOf,
    ageCoverage: { known, total: universe.length },
    oldestMonths: known > 0 ? Math.max(...ages) : null,
    newestMonths: known > 0 ? Math.min(...ages) : null,
    averageKnownMonths: known > 0 ? ages.reduce((sum, months) => sum + months, 0) / known : null,
    hardRawCount,
    groupedInformationalCount: null,
    windowStart,
    groupingPolicyVersion: null,
    legacyInquiryCount: input.legacyInquiryCount ?? null,
  };
}
