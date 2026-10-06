import type { ClientStatus } from "@prisma/client";

/**
 * Mapper Fondify Agency → jh-crm ClientStatus.
 * Baseline documentado (TODO: refinar con etapa real del CreditCase).
 * - LEAD → ESTRUCTURACIÓN
 * - ACTIVE / PAUSED → REPARACIÓN
 * - COMPLETED → LISTOS PARA FONDEO
 * - CANCELLED / ARCHIVED → fuera de pills de dominio
 */
export type FondifyBucket = "repair" | "struct" | "ready";

export const FONDIFY_BUCKET_LABELS: Record<FondifyBucket, string> = {
  repair: "REPARACIÓN",
  struct: "ESTRUCTURACIÓN",
  ready: "LISTOS PARA FONDEO",
};

export function mapClientToFondifyStatus(
  status: ClientStatus,
): FondifyBucket | null {
  switch (status) {
    case "LEAD":
      return "struct";
    case "ACTIVE":
    case "PAUSED":
      return "repair";
    case "COMPLETED":
      return "ready";
    case "CANCELLED":
    case "ARCHIVED":
      return null;
    default:
      return null;
  }
}

export function clientStatusesForFondifyBucket(
  bucket: FondifyBucket,
): ClientStatus[] {
  switch (bucket) {
    case "struct":
      return ["LEAD"];
    case "repair":
      return ["ACTIVE", "PAUSED"];
    case "ready":
      return ["COMPLETED"];
  }
}

/** Estados visibles en lista default (excluye ARCHIVED). */
export const LIST_DEFAULT_STATUSES: ClientStatus[] = [
  "LEAD",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
];

export function daysUntil(date: Date, now = Date.now()): number {
  const ms = date.getTime() - now;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function reviewInLabel(days: number): string {
  if (days < 0) return `Venció hace ${Math.abs(days)}d`;
  if (days === 0) return "Revisar hoy";
  return `Revisar en ${days}d`;
}

export function isReviewSoon(days: number): boolean {
  return days <= 3;
}
