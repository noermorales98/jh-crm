/**
 * PR-AN-QUAL — calificación crediticia ≠ pipeline comercial.
 *
 *   npm run smoke:credit-qual
 *
 * Sin DATABASE_URL (función pura + rótulos).
 */
import { qualifyCreditProfile } from "../../src/lib/credit/qualification";
import { FONDIFY_BUCKET_LABELS } from "../../src/lib/fondify/status";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("\n[PR-AN-QUAL] qualifyCreditProfile + rótulos pipeline");

  const empty = qualifyCreditProfile({
    hasReport: false,
    snapshotCount: 0,
    openNegativeCount: 0,
  });
  check("sin reporte → sin_datos", empty.kind === "sin_datos");
  check(
    "sin_datos sin 'fondeo'/'aprobado'",
    !/fondeo|aprobado/i.test(`${empty.label} ${empty.hint}`),
  );

  const noSnapshots = qualifyCreditProfile({
    hasReport: true,
    snapshotCount: 0,
    openNegativeCount: 0,
  });
  check("reporte sin snapshots → sin_datos", noSnapshots.kind === "sin_datos");

  const revision = qualifyCreditProfile({
    hasReport: true,
    snapshotCount: 3,
    openNegativeCount: 2,
  });
  check("con negativos → revision", revision.kind === "revision");
  check(
    "revision no dice listo/aprobado",
    !/listo|aprobado|fondeo/i.test(revision.label),
  );

  const heuristica = qualifyCreditProfile({
    hasReport: true,
    snapshotCount: 3,
    openNegativeCount: 0,
  });
  check("sin negativos → heuristica", heuristica.kind === "heuristica");
  check(
    "heuristica no dice aprobado/fondeo",
    !/aprobado|fondeo/i.test(`${heuristica.label} ${heuristica.hint}`),
  );

  check(
    "rótulo ready comercial sin FONDEO",
    !/FONDEO/i.test(FONDIFY_BUCKET_LABELS.ready),
    FONDIFY_BUCKET_LABELS.ready,
  );
  check(
    "rótulo ready es COMPLETADOS",
    FONDIFY_BUCKET_LABELS.ready === "COMPLETADOS",
  );

  console.log("\nOK credit-qualification\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
