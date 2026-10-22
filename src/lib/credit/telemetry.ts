/**
 * Medición y telemetría del cálculo de crédito.
 * El evento no guarda nombre, SSN, saldo ni el cuerpo de un PDF.
 * No hay un p95 prometido ni una caché común entre organizaciones.
 */
import { buildRevolvingReading, type RevolvingObservation } from "./revolving";

export const TELEMETRY_VERSION = "t27-2026-10-22";

export type CreditTelemetryEvent = "IMPORT_COMPLETED" | "METRIC_COMPUTED" | "RULE_EVALUATED";

export type CreditTelemetry = {
  event: CreditTelemetryEvent;
  durationMs: number;
  policyVersion: string;
  itemCount: number;
  qualityStatus: string;
  correlationId: string;
};

export type ReadingCacheKey = {
  organizationId: string;
  clientId: string;
  snapshotId: string;
  version: string;
};

const EVENTS = new Set<CreditTelemetryEvent>(["IMPORT_COMPLETED", "METRIC_COMPUTED", "RULE_EVALUATED"]);
const SECRET = /\b\d{3}-\d{2}-\d{4}\b|%PDF-/i;

export function redactCreditEvent(input: Record<string, unknown>): CreditTelemetry | null {
  const event = input.event;
  if (typeof event !== "string" || !EVENTS.has(event as CreditTelemetryEvent)) return null;
  if (typeof input.durationMs !== "number" || !Number.isFinite(input.durationMs) || input.durationMs < 0) return null;
  if (typeof input.itemCount !== "number" || !Number.isInteger(input.itemCount) || input.itemCount < 0) return null;
  const policyVersion = safeText(input.policyVersion);
  const qualityStatus = safeText(input.qualityStatus);
  const correlationId = safeText(input.correlationId);
  if (policyVersion == null || qualityStatus == null || correlationId == null) return null;
  return {
    event: event as CreditTelemetryEvent,
    durationMs: input.durationMs,
    policyVersion,
    itemCount: input.itemCount,
    qualityStatus,
    correlationId,
  };
}

export function percentile(sample: readonly number[], rank: number): number | null {
  const values = sample.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (values.length === 0 || !Number.isFinite(rank) || rank < 0 || rank > 100) return null;
  const index = Math.ceil((rank / 100) * values.length) - 1;
  return values[Math.max(0, index)] ?? null;
}

export function performanceBudget(sample: readonly number[]): { p50: number; p95: number } | null {
  if (sample.length === 0) return null;
  const p50 = percentile(sample, 50);
  const p95 = percentile(sample, 95);
  if (p50 == null || p95 == null) return null;
  return { p50, p95 };
}

export function readingCacheKey(key: ReadingCacheKey): string | null {
  const parts = [key.organizationId, key.clientId, key.snapshotId, key.version].map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) return null;
  return parts.join("|");
}

export function readReadingCache<T>(store: ReadonlyMap<string, T>, key: ReadingCacheKey): T | null {
  const id = readingCacheKey(key);
  if (id == null || !store.has(id)) return null;
  return store.get(id) ?? null;
}

export function writeReadingCache<T>(store: Map<string, T>, key: ReadingCacheKey, value: T): boolean {
  const id = readingCacheKey(key);
  if (id == null) return false;
  store.set(id, value);
  return true;
}

export function syntheticRevolvingSample(count: number): RevolvingObservation[] {
  const bureaus = ["EXPERIAN", "EQUIFAX", "TRANSUNION"];
  return Array.from({ length: count }, (_, index) => ({
    id: `acct-${index}`,
    creditorName: "Visa",
    bureau: bureaus[index % bureaus.length] ?? "EXPERIAN",
    accountType: "revolving",
    responsibility: "individual",
    accountStatus: "Open",
    balanceCents: 10_000,
    limitCents: 100_000,
    currency: "USD",
    reportDate: "2024-06-01",
    canonicalId: `can-${index}`,
    identityStatus: "CONFIRMED" as const,
  }));
}

export function measureRevolvingReading(count = 250): {
  itemCount: number;
  firstMs: number;
  secondMs: number;
  sameAggregate: boolean;
  valueBps: number | null;
} {
  const observations = syntheticRevolvingSample(count);
  const firstStarted = performance.now();
  const first = buildRevolvingReading({ asOf: "2024-06-01", observations });
  const firstMs = performance.now() - firstStarted;
  const secondStarted = performance.now();
  const second = buildRevolvingReading({ asOf: "2024-06-01", observations });
  const secondMs = performance.now() - secondStarted;
  return {
    itemCount: observations.length,
    firstMs,
    secondMs,
    sameAggregate: JSON.stringify(first.consolidated) === JSON.stringify(second.consolidated),
    valueBps: first.consolidated.individual.valueBps,
  };
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || SECRET.test(text)) return null;
  return text;
}
