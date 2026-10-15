/**
 * Constantes y helpers de lease para CreditPdfImportJob.
 * Sin I/O: usable en smokes de lógica pura.
 */

export const CREDIT_PDF_JOB_MAX_ATTEMPTS = 3;

/** Duración del lease por claim (renovable en cada fase). */
export const CREDIT_PDF_JOB_LEASE_MS = 10 * 60 * 1000;

/**
 * No reclamar QUEUED recién creados: dar margen a `after()` del start manual.
 */
export const CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS = 20_000;

/** Máximo de jobs a procesar por invocación del cron. */
export const CREDIT_PDF_JOB_CRON_BATCH = 3;

/** Margen antes de maxDuration para no empezar otro job. */
export const CREDIT_PDF_JOB_CRON_DEADLINE_BUFFER_MS = 25_000;

export type CreditPdfClaimKind = "queued" | "stale_running";

export function newLeaseToken(): string {
  return crypto.randomUUID();
}

export function leaseExpiryFrom(now: Date, leaseMs = CREDIT_PDF_JOB_LEASE_MS): Date {
  return new Date(now.getTime() + leaseMs);
}

export function isLeaseExpired(
  leaseExpiresAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!leaseExpiresAt) return true;
  return leaseExpiresAt.getTime() <= now.getTime();
}

/** QUEUED elegible para recovery (edad mínima). */
export function isQueuedRecoverable(
  createdAt: Date,
  now: Date,
  minAgeMs = CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS,
): boolean {
  return now.getTime() - createdAt.getTime() >= minAgeMs;
}

export function shouldFailAfterAttempt(attempts: number): boolean {
  return attempts >= CREDIT_PDF_JOB_MAX_ATTEMPTS;
}
