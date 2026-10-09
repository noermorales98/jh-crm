import type { ClientStatus } from "@prisma/client";

/**
 * Mapper de pipeline comercial (ClientStatus → bucket de lista/filtro).
 * No es calificación crediticia (ver src/lib/credit/qualification.ts).
 * - LEAD → ESTRUCTURACIÓN
 * - ACTIVE / PAUSED → EN REPARACIÓN
 * - COMPLETED → COMPLETADOS
 * - CANCELLED / ARCHIVED → fuera de pills de dominio
 */
export type FondifyBucket = "repair" | "struct" | "ready";

/** Rótulos de estado del cliente (pipeline), no de elegibilidad de fondeo. */
export const FONDIFY_BUCKET_LABELS: Record<FondifyBucket, string> = {
  repair: "EN REPARACIÓN",
  struct: "ESTRUCTURACIÓN",
  ready: "COMPLETADOS",
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
