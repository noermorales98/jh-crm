/**
 * Lógica pura de lease (sin DB).
 *
 *   npm run smoke:credit-pdf-lease
 */
import {
  CREDIT_PDF_JOB_MAX_ATTEMPTS,
  CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS,
  isLeaseExpired,
  isQueuedRecoverable,
  leaseExpiryFrom,
  shouldFailAfterAttempt,
} from "../../src/server/credit-import/job-lease";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("\n[credit-pdf-lease] helpers puros");

  const now = new Date("2026-10-15T12:00:00.000Z");
  check(
    "QUEUED fresco no recuperable",
    isQueuedRecoverable(now, now) === false,
  );
  check(
    "QUEUED con edad mínima recuperable",
    isQueuedRecoverable(
      new Date(now.getTime() - CREDIT_PDF_JOB_QUEUED_MIN_AGE_MS),
      now,
    ) === true,
  );
  check(
    "lease null se trata como expirado",
    isLeaseExpired(null, now) === true,
  );
  const future = leaseExpiryFrom(now, 60_000);
  check("lease futuro vigente", isLeaseExpired(future, now) === false);
  check(
    "lease pasado vencido",
    isLeaseExpired(new Date(now.getTime() - 1), now) === true,
  );
  check("attempts < max → reintentar", shouldFailAfterAttempt(1) === false);
  check(
    "attempts >= max → fallo final",
    shouldFailAfterAttempt(CREDIT_PDF_JOB_MAX_ATTEMPTS) === true,
  );

  console.log("\nOK credit-pdf-job-lease\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
