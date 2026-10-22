/**
 * Diferencias entre burós de una identidad confirmada.
 * Describe el dato. No prueba que sea inexacto ni abre una disputa.
 */

import { classifyOwnership } from "./normalize";

export const ANOMALY_VERSION = "t15-2026-10-21";
export const ANOMALY_NOT_INACCURACY = "No prueba que el dato sea inexacto.";
export const NEGATIVES_NOT_CERTIFIED =
  "La cobertura no alcanza para decir si hay negativos.";
export const NEGATIVES_NONE_LISTED = "El reporte cargado no lista cuentas negativas.";

export type AnomalyCoverage = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type NegativeReading = "NONE_LISTED" | "PRESENT" | "UNKNOWN";
export type AnomalyKind = "VALUE_DISCREPANCY" | "OWNERSHIP_CONFLICT" | "PAYMENT_HISTORY_CONFLICT";
export type TemporalComparability = "COMPARABLE" | "DIFFERENT_DATES" | "UNKNOWN";

export type AnomalyObservation = {
  id: string;
  canonicalId: string | null;
  identityStatus: "CONFIRMED" | "NONE";
  bureau: string;
  creditorName: string;
  balanceCents: number | null;
  dateReported: string | null;
  responsibility: string | null;
  ownershipConfirmed: boolean;
  paymentStatus: string | null;
  isNegative: boolean;
  negativeType: string | null;
};

export type CreditAnomaly = {
  canonicalId: string;
  creditorName: string;
  bureaus: string[];
  field: string;
  observationIds: string[];
  kind: AnomalyKind;
  temporalComparability: TemporalComparability;
  reviewRequired: true;
  provesInaccuracy: false;
  describedDeltaCents: number | null;
  values: string[];
  dates: (string | null)[];
  severity: "REVIEW";
  version: typeof ANOMALY_VERSION;
};

export type AnomalyReading = {
  version: typeof ANOMALY_VERSION;
  coverage: AnomalyCoverage;
  negativeReading: NegativeReading;
  anomalies: CreditAnomaly[];
};

export function negativeListed(coverage: AnomalyCoverage, negativeCount: number): boolean | null {
  if (negativeCount > 0) return false;
  if (coverage === "COMPLETE") return true;
  return null;
}

export function buildAnomalyReading(input: {
  coverage: AnomalyCoverage;
  negativeCount: number;
  observations: readonly AnomalyObservation[];
}): AnomalyReading {
  const groups = new Map<string, AnomalyObservation[]>();
  for (const item of input.observations) {
    if (item.identityStatus !== "CONFIRMED" || item.canonicalId == null || item.canonicalId.trim() === "") {
      continue;
    }
    groups.set(item.canonicalId, [...(groups.get(item.canonicalId) ?? []), item]);
  }
  const anomalies: CreditAnomaly[] = [];
  for (const [canonicalId, items] of groups) {
    anomalies.push(...valueDiscrepancy(canonicalId, items));
    anomalies.push(...paymentConflict(canonicalId, items));
    anomalies.push(...ownershipConflict(canonicalId, items));
  }
  anomalies.sort((left, right) => {
    if (left.canonicalId !== right.canonicalId) return left.canonicalId < right.canonicalId ? -1 : 1;
    if (left.field !== right.field) return left.field < right.field ? -1 : 1;
    return left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0;
  });
  return {
    version: ANOMALY_VERSION,
    coverage: input.coverage,
    negativeReading: negativeReading(input.coverage, input.negativeCount),
    anomalies,
  };
}

function negativeReading(coverage: AnomalyCoverage, negativeCount: number): NegativeReading {
  if (negativeCount > 0) return "PRESENT";
  if (coverage === "COMPLETE") return "NONE_LISTED";
  return "UNKNOWN";
}

function monthKey(date: string | null): string | null {
  if (date == null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  if (year == null || month == null || day == null) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

function comparability(dates: readonly (string | null)[]): TemporalComparability {
  const keys = dates.map(monthKey);
  if (keys.some((key) => key == null)) return "UNKNOWN";
  return keys.every((key) => key === keys[0]) ? "COMPARABLE" : "DIFFERENT_DATES";
}

function ordered(items: readonly AnomalyObservation[]): AnomalyObservation[] {
  return [...items].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function baseAnomaly(
  canonicalId: string,
  items: readonly AnomalyObservation[],
  field: string,
  kind: AnomalyKind,
  describedDeltaCents: number | null,
  values: string[],
): CreditAnomaly {
  const rows = ordered(items);
  return {
    canonicalId,
    creditorName: rows[0]?.creditorName ?? "",
    bureaus: rows.map((item) => item.bureau),
    field,
    observationIds: rows.map((item) => item.id),
    kind,
    temporalComparability: comparability(rows.map((item) => item.dateReported)),
    reviewRequired: true,
    provesInaccuracy: false,
    describedDeltaCents,
    values,
    dates: rows.map((item) => item.dateReported),
    severity: "REVIEW",
    version: ANOMALY_VERSION,
  };
}

function valueDiscrepancy(canonicalId: string, items: readonly AnomalyObservation[]): CreditAnomaly[] {
  const known = items.filter((item) => item.balanceCents != null && Number.isSafeInteger(item.balanceCents));
  const amounts = [...new Set(known.map((item) => item.balanceCents as number))];
  if (known.length < 2 || amounts.length < 2) return [];
  const delta = Math.max(...amounts) - Math.min(...amounts);
  return [baseAnomaly(canonicalId, known, "balance", "VALUE_DISCREPANCY", delta, amounts.map(String))];
}

function paymentText(value: string | null): string | null {
  const text = value?.trim() ?? "";
  return text === "" ? null : text;
}

function paymentConflict(canonicalId: string, items: readonly AnomalyObservation[]): CreditAnomaly[] {
  const known = items.filter((item) => paymentText(item.paymentStatus) != null);
  const texts = [...new Set(known.map((item) => paymentText(item.paymentStatus) as string))];
  const folded = new Set(texts.map((text) => text.toLowerCase()));
  if (known.length < 2 || folded.size < 2) return [];
  return [baseAnomaly(canonicalId, known, "paymentStatus", "PAYMENT_HISTORY_CONFLICT", null, texts)];
}

function ownershipKind(item: AnomalyObservation): string | null {
  if (!item.ownershipConfirmed) return null;
  const classified = classifyOwnership(item.responsibility, "anomaly");
  if (classified.ownership.value === "AUTHORIZED_USER") return "AUTHORIZED_USER";
  if (classified.ownership.quality !== "KNOWN") return null;
  if (classified.ownership.value === "INDIVIDUAL" || classified.ownership.value === "JOINT") {
    return classified.ownership.value;
  }
  return null;
}

function ownershipConflict(canonicalId: string, items: readonly AnomalyObservation[]): CreditAnomaly[] {
  const confirmed = items.filter((item) => ownershipKind(item) != null);
  const kinds = new Set(confirmed.map((item) => ownershipKind(item)));
  if (kinds.size < 2) return [];
  const texts = [...new Set(confirmed.map((item) => item.responsibility ?? ""))];
  return [baseAnomaly(canonicalId, confirmed, "responsibility", "OWNERSHIP_CONFLICT", null, texts)];
}
