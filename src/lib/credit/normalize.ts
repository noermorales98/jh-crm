/**
 * Normaliza una observación sin escribir Prisma ni sustituir el texto original.
 * La tabla de alias de acreedor nace vacía: no hay catálogo de bancos.
 */
import {
  parseMoney,
  parsePartialDate,
  type AccountFamily,
  type FieldQuality,
  type FieldSource,
  type FieldValue,
  type MoneyAmount,
  type Ownership,
  type PartialDate,
  type ReviewState,
} from "./contracts";

export const NORMALIZER_VERSION = "t04-2026-10-19";
export const CREDITOR_ALIAS_VERSION = "creditor-aliases-2026-10-19";

export type KnownMoneyLocale = "en-US" | "es-ES";

export type CreditorRole = "ISSUER" | "COLLECTOR" | "ORIGINAL_CREDITOR" | "UNKNOWN";

export type CreditorAlias = {
  from: string;
  to: string;
};

/** Vacío a propósito. Un alias nuevo tiene que entrar aquí con revisión, no por semejanza. */
export const DEFAULT_CREDITOR_ALIASES: readonly CreditorAlias[] = [];

export type NormalizationWarning =
  | "OWNERSHIP_REQUIRES_CONFIRMATION"
  | "NEGATIVE_BALANCE_KEPT"
  | "HIGH_BALANCE_IS_NOT_LIMIT"
  | "HIGH_BALANCE_IS_NOT_OPENED_DATE"
  | "INFERRED_FIELD";

export type ObservationLocator = {
  page?: number | null;
  blockId?: string | null;
};

export type NormalizeObservationInput = {
  rawItemId: string;
  reportId: string;
  creditorName?: string | null;
  accountType?: string | null;
  responsibility?: string | null;
  balance?: unknown;
  creditLimit?: unknown;
  highBalance?: unknown;
  dateOpened?: unknown;
  locale?: KnownMoneyLocale | null;
  currency?: string | null;
  aliases?: readonly CreditorAlias[];
  locator?: ObservationLocator | null;
};

export type NormalizedObservation = {
  rawItemId: string;
  normalizerVersion: string;
  aliasVersion: string;
  review: "PROPOSED";
  raw: {
    creditorName: string | null;
    accountType: string | null;
    responsibility: string | null;
    balance: unknown;
    creditLimit: unknown;
    highBalance: unknown;
    dateOpened: unknown;
  };
  family: FieldValue<AccountFamily>;
  ownership: FieldValue<Ownership>;
  creditor: {
    rawName: string | null;
    normalized: string | null;
    role: CreditorRole;
    roleQuality: FieldQuality;
  };
  balance: FieldValue<MoneyAmount>;
  creditLimit: FieldValue<MoneyAmount>;
  dateOpened: FieldValue<PartialDate>;
  warnings: NormalizationWarning[];
};

function locatorSource(reportId: string, locator?: ObservationLocator | null): FieldSource {
  return {
    reportId,
    page: locator?.page ?? null,
    blockId: locator?.blockId ?? null,
  };
}

function field<T>(
  value: T | null,
  quality: FieldQuality,
  reportId: string,
  locator?: ObservationLocator | null,
  review: ReviewState = "PROPOSED",
): FieldValue<T> {
  return { value, quality, source: locatorSource(reportId, locator), review };
}

function withLocator<T>(value: FieldValue<T>, reportId: string, locator?: ObservationLocator | null): FieldValue<T> {
  return { ...value, source: locatorSource(reportId, locator) };
}

function present(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text.length ? text : null;
}

export function classifyAccountFamily(
  accountType: string | null | undefined,
  reportId: string,
  locator?: ObservationLocator | null,
): FieldValue<AccountFamily> {
  const text = present(accountType)?.toLowerCase() ?? null;
  if (text == null) return field("UNKNOWN", "MISSING", reportId, locator);
  if (/\b(revolving|credit card|tarjeta de cr[eé]dito)\b/.test(text)) {
    return field("REVOLVING", "INFERRED", reportId, locator);
  }
  if (/\b(installment|auto loan|pr[eé]stamo)\b/.test(text)) {
    return field("INSTALLMENT", "INFERRED", reportId, locator);
  }
  if (/\b(mortgage|hipoteca)\b/.test(text)) {
    return field("MORTGAGE", "INFERRED", reportId, locator);
  }
  if (/\b(charge card|cargo)\b/.test(text) && !/charge-?off/.test(text)) {
    return field("CHARGE", "INFERRED", reportId, locator);
  }
  if (/\b(collection|cobranza)\b/.test(text)) {
    return field("COLLECTION", "INFERRED", reportId, locator);
  }
  if (text === "other") return field("OTHER", "INFERRED", reportId, locator);
  return field("UNKNOWN", "INFERRED", reportId, locator);
}

export function classifyOwnership(
  responsibility: string | null | undefined,
  reportId: string,
  locator?: ObservationLocator | null,
): { ownership: FieldValue<Ownership>; warnings: NormalizationWarning[] } {
  const text = present(responsibility)?.toLowerCase() ?? null;
  if (text == null) {
    return { ownership: field("UNKNOWN", "MISSING", reportId, locator), warnings: [] };
  }

  const explicit = new Set<Ownership>();
  if (/\bco-?signer\b/.test(text)) explicit.add("COSIGNER");
  if (/\bjoint\b/.test(text)) explicit.add("JOINT");
  if (/\bindividual\b/.test(text)) explicit.add("INDIVIDUAL");
  const authorized = /\bauthorized\s+user\b|\busuario\s+autorizado\b/.test(text);

  if (explicit.size > 1 || (explicit.size === 1 && authorized)) {
    return {
      ownership: field("UNKNOWN", "CONFLICT", reportId, locator),
      warnings: ["OWNERSHIP_REQUIRES_CONFIRMATION"],
    };
  }
  if (explicit.size === 1) {
    const [value] = explicit;
    return { ownership: field(value, "KNOWN", reportId, locator), warnings: [] };
  }
  if (authorized) {
    return {
      ownership: field("AUTHORIZED_USER", "INFERRED", reportId, locator),
      warnings: ["OWNERSHIP_REQUIRES_CONFIRMATION"],
    };
  }
  return { ownership: field("UNKNOWN", "INFERRED", reportId, locator), warnings: [] };
}

function creditorKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function normalizeCreditorName(
  raw: string | null | undefined,
  aliases: readonly CreditorAlias[] = DEFAULT_CREDITOR_ALIASES,
): string | null {
  const text = present(raw);
  if (text == null) return null;
  const key = creditorKey(text);
  const table = new Map(aliases.map((alias) => [creditorKey(alias.from), creditorKey(alias.to)]));
  return table.get(key) ?? key;
}

function creditorRole(raw: string | null): { role: CreditorRole; roleQuality: FieldQuality } {
  const text = present(raw)?.toLowerCase() ?? null;
  if (text == null) return { role: "UNKNOWN", roleQuality: "MISSING" };
  if (/\boriginal creditor\b|\bacreedor original\b/.test(text)) {
    return { role: "ORIGINAL_CREDITOR", roleQuality: "KNOWN" };
  }
  if (/\b(collector|collection agency|cobrador)\b/.test(text)) {
    return { role: "COLLECTOR", roleQuality: "KNOWN" };
  }
  if (/\b(issuer|emisor)\b/.test(text)) {
    return { role: "ISSUER", roleQuality: "KNOWN" };
  }
  return { role: "UNKNOWN", roleQuality: "MISSING" };
}

function centsFromParts(negative: boolean, whole: string, frac: string | undefined): number | null {
  const fraction = (frac ?? "").padEnd(2, "0");
  let cents: bigint;
  try {
    cents = BigInt(whole) * 100n + BigInt(fraction || "0");
  } catch {
    return null;
  }
  if (negative) cents = -cents;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(-Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(cents);
}

function declaredCurrency(currency: string | null | undefined): string | null | "invalid" {
  if (currency == null || currency === "") return null;
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return "invalid";
  return code;
}

/** Locale conocido. Sin locale no se interpreta ni la coma de miles ni la coma decimal. */
export function parseLocalizedMoney(
  raw: unknown,
  reportId: string,
  locale: KnownMoneyLocale | null | undefined,
  currency?: string | null,
  locator?: ObservationLocator | null,
): FieldValue<MoneyAmount> {
  const code = declaredCurrency(currency);
  if (code === "invalid") return field(null, "INVALID", reportId, locator);
  if (locale == null) return withLocator(parseMoney(raw, reportId, code), reportId, locator);

  if (raw == null) return field(null, "MISSING", reportId, locator);
  if (typeof raw === "number") return withLocator(parseMoney(raw, reportId, code), reportId, locator);
  if (typeof raw !== "string") return field(null, "INVALID", reportId, locator);
  const text = raw.trim().replace(/\$\s+/g, "$");
  if (!text) return field(null, "MISSING", reportId, locator);

  const pattern =
    locale === "en-US"
      ? /^(-?)\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/
      : /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;
  const match = pattern.exec(text);
  if (!match) return field(null, "INVALID", reportId, locator);
  const whole = (match[2] ?? "").replace(/[.,]/g, "");
  const cents = centsFromParts(match[1] === "-", whole, match[3]);
  if (cents == null) return field(null, "INVALID", reportId, locator);
  return field({ cents, currency: code }, "KNOWN", reportId, locator);
}

/** `06/2020` queda en mes. No se inventa el día 1. */
export function parseLocalizedPartialDate(
  raw: unknown,
  reportId: string,
  locale: KnownMoneyLocale | null | undefined,
  locator?: ObservationLocator | null,
): FieldValue<PartialDate> {
  if (raw == null || raw === "") return field(null, "MISSING", reportId, locator);
  if (raw instanceof Date || typeof raw !== "string") return parsePartialDate(raw, reportId);
  const text = raw.trim();
  if (!text) return field(null, "MISSING", reportId, locator);
  if (/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(text)) return parsePartialDate(text, reportId);
  if (!text.includes("/")) return parsePartialDate(text, reportId);
  if (locale == null) return field(null, "INVALID", reportId, locator);

  const monthYear = /^(\d{2})\/(\d{4})$/.exec(text);
  if (monthYear) {
    const month = Number(monthYear[1]);
    const year = Number(monthYear[2]);
    if (month < 1 || month > 12) return field(null, "INVALID", reportId, locator);
    return field({ year, month, day: null, precision: "MONTH" }, "KNOWN", reportId, locator);
  }

  const full = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!full) return field(null, "INVALID", reportId, locator);
  const first = Number(full[1]);
  const second = Number(full[2]);
  const year = Number(full[3]);
  const month = locale === "en-US" ? first : second;
  const day = locale === "en-US" ? second : first;
  if (month < 1 || month > 12) return field(null, "INVALID", reportId, locator);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > lastDay) return field(null, "INVALID", reportId, locator);
  return field({ year, month, day, precision: "DAY" }, "KNOWN", reportId, locator);
}

function hasValue(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === "string") return raw.trim().length > 0;
  return true;
}

export function normalizeCreditObservation(input: NormalizeObservationInput): NormalizedObservation {
  const reportId = input.reportId;
  const locator = input.locator;
  const locale = input.locale ?? null;
  const family = classifyAccountFamily(input.accountType, reportId, locator);
  const ownershipResult = classifyOwnership(input.responsibility, reportId, locator);
  const balance = parseLocalizedMoney(input.balance, reportId, locale, input.currency, locator);
  const creditLimit = parseLocalizedMoney(input.creditLimit, reportId, locale, input.currency, locator);
  const dateOpened = parseLocalizedPartialDate(input.dateOpened, reportId, locale, locator);
  const warnings = new Set<NormalizationWarning>(ownershipResult.warnings);

  if (family.quality === "INFERRED" || ownershipResult.ownership.quality === "INFERRED") {
    warnings.add("INFERRED_FIELD");
  }
  if (balance.quality === "KNOWN" && balance.value != null && balance.value.cents < 0) {
    warnings.add("NEGATIVE_BALANCE_KEPT");
  }
  if (hasValue(input.highBalance)) {
    if (!hasValue(input.creditLimit)) warnings.add("HIGH_BALANCE_IS_NOT_LIMIT");
    if (!hasValue(input.dateOpened)) warnings.add("HIGH_BALANCE_IS_NOT_OPENED_DATE");
  }

  const rawName = input.creditorName ?? null;
  const role = creditorRole(rawName);

  return {
    rawItemId: input.rawItemId,
    normalizerVersion: NORMALIZER_VERSION,
    aliasVersion: CREDITOR_ALIAS_VERSION,
    review: "PROPOSED",
    raw: {
      creditorName: rawName,
      accountType: input.accountType ?? null,
      responsibility: input.responsibility ?? null,
      balance: input.balance ?? null,
      creditLimit: input.creditLimit ?? null,
      highBalance: input.highBalance ?? null,
      dateOpened: input.dateOpened ?? null,
    },
    family,
    ownership: ownershipResult.ownership,
    creditor: {
      rawName,
      normalized: normalizeCreditorName(rawName, input.aliases ?? DEFAULT_CREDITOR_ALIASES),
      role: role.role,
      roleQuality: role.roleQuality,
    },
    balance,
    creditLimit,
    dateOpened,
    warnings: [...warnings],
  };
}
