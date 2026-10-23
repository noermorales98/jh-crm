/**
 * Contratos de calidad, dinero y scores.
 * Convención interna. No valida un prestamista ni impone 300–850.
 * null no es 0. La moneda ausente no se rellena como USD.
 */
import { z } from "zod";
import { classifyAccountFamily, classifyOwnership } from "./normalize";

export const fieldQualitySchema = z.enum([
  "KNOWN",
  "MISSING",
  "INFERRED",
  "CONFLICT",
  "INVALID",
]);
export type FieldQuality = z.infer<typeof fieldQualitySchema>;

export const reviewStateSchema = z.enum(["PROPOSED", "CONFIRMED", "REJECTED"]);
export type ReviewState = z.infer<typeof reviewStateSchema>;

export const accountFamilySchema = z.enum([
  "REVOLVING",
  "INSTALLMENT",
  "MORTGAGE",
  "CHARGE",
  "COLLECTION",
  "OTHER",
  "UNKNOWN",
]);
export type AccountFamily = z.infer<typeof accountFamilySchema>;

export const ownershipSchema = z.enum([
  "INDIVIDUAL",
  "JOINT",
  "COSIGNER",
  "AUTHORIZED_USER",
  "UNKNOWN",
]);
export type Ownership = z.infer<typeof ownershipSchema>;

export const datePrecisionSchema = z.enum(["YEAR", "MONTH", "DAY"]);
export type DatePrecision = z.infer<typeof datePrecisionSchema>;

export const fieldSourceSchema = z.object({
  reportId: z.string(),
  page: z.number().int().positive().nullable(),
  blockId: z.string().nullable(),
});
export type FieldSource = z.infer<typeof fieldSourceSchema>;

export type FieldValue<T> = {
  value: T | null;
  quality: FieldQuality;
  source: FieldSource;
  review: ReviewState;
};

export type MoneyAmount = {
  /** Centavos enteros. Negativo = crédito a favor, sin recortar. */
  cents: number;
  /** null = moneda no declarada. No equivale a USD. */
  currency: string | null;
};

export type PartialDate = {
  year: number;
  month: number | null;
  day: number | null;
  precision: DatePrecision;
};

export type ScoreIdentity = {
  bureau: string | null;
  family: string | null;
  version: string | null;
  variant: string | null;
};

export const moneyAmountSchema = z.object({
  cents: z.number().int(),
  currency: z.string().trim().length(3).nullable(),
});

const source = (reportId: string): FieldSource => ({
  reportId,
  page: null,
  blockId: null,
});

function field<T>(
  value: null,
  quality: FieldQuality,
  reportId: string,
  review?: ReviewState,
): FieldValue<T>;
function field<T>(
  value: T,
  quality: FieldQuality,
  reportId: string,
  review?: ReviewState,
): FieldValue<T>;
function field<T>(
  value: T | null,
  quality: FieldQuality,
  reportId: string,
  review: ReviewState = "PROPOSED",
): FieldValue<T> {
  return { value, quality, source: source(reportId), review };
}

function moneyText(raw: unknown): "missing" | "invalid" | string {
  if (raw == null) return "missing";
  if (typeof raw === "string") {
    const text = raw.trim();
    return text.length === 0 ? "missing" : text;
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return "invalid";
    if (Object.is(raw, -0)) return "0";
    const text = raw.toString();
    if (/e/i.test(text)) return "invalid";
    return text;
  }
  if (typeof raw === "object" && !(raw instanceof Date)) {
    const text = String(raw).trim();
    if (!text || text === "[object Object]") return "invalid";
    return text;
  }
  return "invalid";
}

/** Dólares en texto → centavos, sin float. Más de 2 decimales o locale mixto = inválido. */
export function parseMoney(
  raw: unknown,
  reportId: string,
  currency?: string | null,
): FieldValue<MoneyAmount> {
  const text = moneyText(raw);
  if (text === "missing") return field(null, "MISSING", reportId);
  if (text === "invalid") return field(null, "INVALID", reportId);

  const declared =
    currency == null || currency === ""
      ? null
      : currency.trim().toUpperCase();
  if (declared != null && !/^[A-Z]{3}$/.test(declared)) {
    return field(null, "INVALID", reportId);
  }

  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return field(null, "INVALID", reportId);
  const negative = match[1] === "-";
  const whole = match[2] ?? "0";
  const frac = (match[3] ?? "").padEnd(2, "0");
  let cents: bigint;
  try {
    cents = BigInt(whole) * 100n + BigInt(frac);
  } catch {
    return field(null, "INVALID", reportId);
  }
  if (negative) cents = -cents;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(-Number.MAX_SAFE_INTEGER)) {
    return field(null, "INVALID", reportId);
  }
  return field({ cents: Number(cents), currency: declared }, "KNOWN", reportId);
}

export function sameCurrency(
  left: string | null,
  right: string | null,
): boolean {
  if (left == null || right == null) return false;
  return left.toUpperCase() === right.toUpperCase();
}

/** 10% → 1000 bps. 0 es conocido. Fuera de 0..10000 o con más de 2 decimales = inválido. */
export function percentToBps(
  raw: unknown,
  reportId: string,
): FieldValue<number> {
  const text = moneyText(raw);
  if (text === "missing") return field(null, "MISSING", reportId);
  if (text === "invalid") return field(null, "INVALID", reportId);
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return field(null, "INVALID", reportId);
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? "").padEnd(2, "0"));
  const bps = whole * 100 + frac;
  if (bps > 10_000) return field(null, "INVALID", reportId);
  return field(bps, "KNOWN", reportId);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "2020" no se convierte en 2020-01-01. */
export function parsePartialDate(
  raw: unknown,
  reportId: string,
): FieldValue<PartialDate> {
  if (raw == null || raw === "") return field(null, "MISSING", reportId);
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return field(null, "INVALID", reportId);
    return field(
      {
        year: raw.getUTCFullYear(),
        month: raw.getUTCMonth() + 1,
        day: raw.getUTCDate(),
        precision: "DAY",
      },
      "KNOWN",
      reportId,
    );
  }
  if (typeof raw !== "string") return field(null, "INVALID", reportId);
  const text = raw.trim();
  if (!text) return field(null, "MISSING", reportId);
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text);
  if (!match) return field(null, "INVALID", reportId);
  const year = Number(match[1]);
  const month = match[2] == null ? null : Number(match[2]);
  const day = match[3] == null ? null : Number(match[3]);
  if (month != null && (month < 1 || month > 12)) {
    return field(null, "INVALID", reportId);
  }
  if (day != null) {
    if (month == null || day < 1 || day > daysInMonth(year, month)) {
      return field(null, "INVALID", reportId);
    }
    return field({ year, month, day, precision: "DAY" }, "KNOWN", reportId);
  }
  if (month != null) {
    return field({ year, month, day: null, precision: "MONTH" }, "KNOWN", reportId);
  }
  return field(
    { year, month: null, day: null, precision: "YEAR" },
    "KNOWN",
    reportId,
  );
}

function present(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text.length ? text : null;
}

export function scoresComparable(
  left: ScoreIdentity,
  right: ScoreIdentity,
): { comparable: boolean; reason: "COMPARABLE" | "MISSING_IDENTITY" | "DIFFERENT_IDENTITY" } {
  const keys = ["bureau", "family", "version", "variant"] as const;
  for (const key of keys) {
    if (present(left[key]) == null || present(right[key]) == null) {
      return { comparable: false, reason: "MISSING_IDENTITY" };
    }
  }
  const same = keys.every(
    (key) => present(left[key])!.toUpperCase() === present(right[key])!.toUpperCase(),
  );
  return same
    ? { comparable: true, reason: "COMPARABLE" }
    : { comparable: false, reason: "DIFFERENT_IDENTITY" };
}

export const SCORE_COMPARISON_VERSION = "t09-2026-10-20";
export const UNKNOWN_SCORE_MODEL_LABEL = "modelo desconocido";
export const INFORMATIONAL_SCORE_AVERAGE_LABEL = "Score promedio informativo";

export type ScoreObservation = ScoreIdentity & {
  value: number | null;
  /** YYYY-MM-DD. Ausente no se inventa. */
  scoreDate: string | null;
};

export type ScoreComparison = {
  comparable: boolean;
  delta: number | null;
  reason: "SAME_MODEL" | "MISSING_MODEL" | "DIFFERENT_MODEL" | "INVALID_DATES";
};

function usableScore(value: number | null): value is number {
  return value != null && Number.isInteger(value) && value > 0;
}

/** Delta solo entre el mismo buró y el mismo modelo, con fechas ordenadas. */
export function scoreDelta(left: ScoreObservation, right: ScoreObservation): ScoreComparison {
  const identity = scoresComparable(left, right);
  if (!identity.comparable) {
    return {
      comparable: false,
      delta: null,
      reason: identity.reason === "DIFFERENT_IDENTITY" ? "DIFFERENT_MODEL" : "MISSING_MODEL",
    };
  }
  if (left.scoreDate == null || right.scoreDate == null || right.scoreDate < left.scoreDate) {
    return { comparable: false, delta: null, reason: "INVALID_DATES" };
  }
  if (!usableScore(left.value) || !usableScore(right.value)) {
    return { comparable: false, delta: null, reason: "MISSING_MODEL" };
  }
  return {
    comparable: true,
    delta: right.value - left.value,
    reason: "SAME_MODEL",
  };
}

export type LegacyCreditItemInput = {
  accountType?: string | null;
  responsibility?: string | null;
  balance?: unknown;
  creditLimit?: unknown;
  monthlyPayment?: unknown;
  dateOpened?: Date | string | null;
  dateReported?: Date | string | null;
  reportId: string;
};

export type AdaptedCreditItem = {
  review: "PROPOSED";
  balance: FieldValue<MoneyAmount>;
  creditLimit: FieldValue<MoneyAmount>;
  monthlyPayment: FieldValue<MoneyAmount>;
  dateOpened: FieldValue<PartialDate>;
  dateReported: FieldValue<PartialDate>;
  family: FieldValue<AccountFamily>;
  ownership: FieldValue<Ownership>;
};

export function adaptLegacyCreditItem(item: LegacyCreditItemInput): AdaptedCreditItem {
  const reportId = item.reportId;
  return {
    review: "PROPOSED",
    balance: parseMoney(item.balance, reportId),
    creditLimit: parseMoney(item.creditLimit, reportId),
    monthlyPayment: parseMoney(item.monthlyPayment, reportId),
    dateOpened: parsePartialDate(item.dateOpened, reportId),
    dateReported: parsePartialDate(item.dateReported, reportId),
    family: classifyAccountFamily(item.accountType, reportId),
    ownership: classifyOwnership(item.responsibility, reportId).ownership,
  };
}

export function legacyItemHasInvalidMoney(item: LegacyCreditItemInput): boolean {
  const adapted = adaptLegacyCreditItem(item);
  return (
    adapted.balance.quality === "INVALID" ||
    adapted.creditLimit.quality === "INVALID" ||
    adapted.monthlyPayment.quality === "INVALID"
  );
}

export type CreditScope = {
  organizationId: string;
  clientId: string;
};

export function assertSameCreditScope(left: CreditScope, right: CreditScope): void {
  if (left.organizationId !== right.organizationId || left.clientId !== right.clientId) {
    throw new Error("SCOPE_MISMATCH");
  }
}
