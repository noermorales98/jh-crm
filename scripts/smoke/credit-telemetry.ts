/**
 * Medición de 250 cuentas y telemetría sin datos personales.
 *
 *   npm run smoke:credit-telemetry
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import { extractWindowsWithCheckpoint, windowNeedsRetry } from "../../src/server/credit-import/extract";
import {
  TELEMETRY_VERSION,
  measureRevolvingReading,
  performanceBudget,
  percentile,
  readReadingCache,
  redactCreditEvent,
  writeReadingCache,
} from "../../src/lib/credit/telemetry";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

async function main() {
  console.log("\n[credit-telemetry] medición");
  check("versión", TELEMETRY_VERSION === "t27-2026-10-22");

  const secretName = "Noelia Privada";
  const secretSsn = "123-45-6789";
  const secretBalance = "845123";
  const secretPdf = "%PDF-1.4 cuerpo secreto";
  const event = redactCreditEvent({
    event: "METRIC_COMPUTED",
    durationMs: 12,
    policyVersion: "t11-2026-10-20",
    itemCount: 250,
    qualityStatus: "KNOWN",
    correlationId: "corr-1",
    name: secretName,
    ssn: secretSsn,
    balanceCents: secretBalance,
    pdf: secretPdf,
  });
  const leaked = redactCreditEvent({
    event: "METRIC_COMPUTED",
    durationMs: 12,
    policyVersion: secretSsn,
    itemCount: 250,
    qualityStatus: "KNOWN",
    correlationId: "corr-1",
  });
  const missingDuration = redactCreditEvent({
    event: "METRIC_COMPUTED",
    policyVersion: "t11-2026-10-20",
    itemCount: 250,
    qualityStatus: "KNOWN",
    correlationId: "corr-1",
  });
  const eventJson = JSON.stringify(event);
  check(
    "el evento no guarda nombre, SSN, saldo ni PDF",
    event?.event === "METRIC_COMPUTED" &&
      event.itemCount === 250 &&
      leaked == null &&
      missingDuration == null &&
      !eventJson.includes(secretName) &&
      !eventJson.includes(secretSsn) &&
      !eventJson.includes(secretBalance) &&
      !eventJson.includes(secretPdf),
    event,
  );

  check("sin muestra no hay presupuesto", performanceBudget([]) == null && percentile([], 95) == null);
  const budget = performanceBudget([10, 20, 30, 40]);
  check("p50 y p95 salen de la muestra dada", budget?.p50 === 20 && budget.p95 === 40);

  const store = new Map<string, string>();
  const key = { organizationId: "org-a", clientId: "client-1", snapshotId: "snap-1", version: "1" };
  check("la escritura exige la clave completa", writeReadingCache(store, { ...key, organizationId: " " }, "valor") === false);
  check("la entrada queda en su organización", writeReadingCache(store, key, "valor") === true);
  check(
    "otra organización no lee la entrada",
    readReadingCache(store, { ...key, organizationId: "org-b" }) == null && readReadingCache(store, key) === "valor",
  );
  check(
    "una revisión nueva no encuentra la entrada anterior",
    readReadingCache(store, { ...key, version: "2" }) == null,
  );

  check("un corte por longitud pide otro intento", windowNeedsRetry("length") === true && windowNeedsRetry("stop") === false);
  const windows = await extractWindowsWithCheckpoint({
    windowCount: 1,
    run: async (_index, attempt) => ({ finishReason: attempt === 1 ? "length" : "stop", value: attempt }),
  });
  check(
    "el reintento sigue acotado a una segunda pasada",
    windows.retried.length === 1 && windows.called.length === 2 && windows.incomplete.length === 0,
  );

  const measured = measureRevolvingReading(250);
  console.log(`  duración 1: ${measured.firstMs.toFixed(2)} ms`);
  console.log(`  duración 2: ${measured.secondMs.toFixed(2)} ms`);
  check(
    "250 cuentas dan el mismo agregado en las dos lecturas",
    measured.itemCount === 250 &&
      measured.sameAggregate === true &&
      Number.isFinite(measured.firstMs) &&
      Number.isFinite(measured.secondMs) &&
      measured.firstMs >= 0 &&
      measured.secondMs >= 0,
    { itemCount: measured.itemCount, valueBps: measured.valueBps, sameAggregate: measured.sameAggregate },
  );

  const source = readFileSync("src/lib/credit/telemetry.ts", "utf8");
  check("no hay un p95 fijo", !source.includes("p95Ms") && !/P95\s*=\s*\d+/.test(source));

  console.log("\nOK credit-telemetry\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
