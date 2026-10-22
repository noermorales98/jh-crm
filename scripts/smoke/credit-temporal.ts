/**
 * Antigüedad al corte y consultas con tipo.
 *
 *   npm run smoke:credit-temporal
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  TEMPORAL_VERSION,
  ageMonths,
  formatInquiryReading,
  temporalMetrics,
  type AgeAccount,
  type CivilDate,
} from "../../src/lib/credit/temporal";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function day(iso: string): CivilDate {
  const [year, month, dayOfMonth] = iso.split("-").map(Number);
  return { year, month, day: dayOfMonth, precision: "DAY" };
}

function account(opened: CivilDate | null, extra?: Partial<AgeAccount>): AgeAccount {
  return { opened, closed: false, authorizedUser: false, ...extra };
}

function main() {
  console.log("\n[credit-temporal] corte");

  const sample = temporalMetrics({
    asOf: "2024-01-01",
    accounts: [
      account(day("2014-01-01")),
      account(day("2019-01-01")),
      account(day("2023-01-01")),
    ],
  });
  check(
    "120, 60 y 12 promedian 64",
    sample.oldestMonths === 120 &&
      sample.newestMonths === 12 &&
      sample.averageKnownMonths === 64 &&
      sample.ageCoverage.known === 3 &&
      sample.ageCoverage.total === 3,
    sample,
  );

  const frozen = ageMonths(day("2004-01-01"), "2014-01-01");
  check("el corte no usa el reloj de hoy", frozen === 120);

  const monthOnly = ageMonths(
    { year: 2020, month: 6, day: null, precision: "MONTH" },
    "2024-01-01",
  );
  check("la precisión de mes no inventa el día", monthOnly === 43);

  const yearOnly = temporalMetrics({
    asOf: "2024-01-01",
    accounts: [account({ year: 2019, month: null, day: null, precision: "YEAR" }), account(day("2023-01-01"))],
  });
  check(
    "un año suelto no entra al promedio",
    yearOnly.ageCoverage.known === 1 &&
      yearOnly.ageCoverage.total === 2 &&
      yearOnly.averageKnownMonths === 12,
  );

  const missing = temporalMetrics({
    asOf: "2024-01-01",
    accounts: [account(day("2014-01-01")), account(null)],
  });
  check(
    "una fecha ausente no es cero",
    missing.ageCoverage.known === 1 &&
      missing.ageCoverage.total === 2 &&
      missing.averageKnownMonths === 120,
  );

  const future = temporalMetrics({
    asOf: "2024-06-01",
    accounts: [account(day("2025-01-01"))],
  });
  check(
    "una apertura futura no es edad negativa",
    future.oldestMonths == null && future.ageCoverage.known === 0 && future.ageCoverage.total === 1,
  );

  const leap = ageMonths(day("2024-02-29"), "2025-02-28");
  check("el 29 de febrero se compara como fecha civil", leap === 11);

  const closed = temporalMetrics({
    asOf: "2024-01-01",
    accounts: [account(day("2014-01-01"), { closed: true }), account(day("2023-01-01"))],
  });
  const withClosed = temporalMetrics({
    asOf: "2024-01-01",
    accounts: [account(day("2014-01-01"), { closed: true })],
    view: { includeClosed: true },
  });
  check("la vista por defecto excluye cerradas", closed.ageCoverage.total === 1 && closed.oldestMonths === 12);
  check("la vista pedida incluye cerradas", withClosed.oldestMonths === 120);

  const au = temporalMetrics({
    asOf: "2024-01-01",
    accounts: [account(day("2014-01-01"), { authorizedUser: true }), account(day("2023-01-01"))],
  });
  check("la vista por defecto excluye usuarios autorizados", au.ageCoverage.total === 1 && au.oldestMonths === 12);

  const counted = temporalMetrics({
    asOf: "2024-06-01",
    accounts: [],
    windowMonths: 12,
    legacyInquiryCount: 4,
    inquiries: [
      { bureau: "EXPERIAN", inquiredOn: "2024-01-15", kind: "HARD" },
      { bureau: "EXPERIAN", inquiredOn: "2023-05-31", kind: "HARD" },
      { bureau: "EXPERIAN", inquiredOn: "2024-03-01", kind: "SOFT" },
      { bureau: "EXPERIAN", inquiredOn: "2024-03-02", kind: "UNKNOWN" },
      { bureau: "EXPERIAN", inquiredOn: null, kind: "HARD" },
      { bureau: null, inquiredOn: "2024-03-03", kind: "HARD" },
    ],
  });
  check("solo entra la consulta dura de la ventana", counted.hardRawCount === 1 && counted.windowStart === "2023-06-01");
  check("SOFT y UNKNOWN no se vuelven duras", counted.hardRawCount === 1);
  check(
    "sin política el agrupado queda vacío",
    counted.groupedInformationalCount == null && counted.groupingPolicyVersion == null,
  );

  const legacy = temporalMetrics({
    asOf: "2024-06-01",
    accounts: [],
    windowMonths: 12,
    legacyInquiryCount: 3,
    inquiries: null,
  });
  check(
    "el contador legado no fabrica consultas",
    legacy.hardRawCount == null && legacy.legacyInquiryCount === 3,
  );
  check(
    "cuatro consultas no se rotulan como rechazo",
    formatInquiryReading({ hardRawCount: null, legacyInquiryCount: 4 }) === "4 contador",
  );

  const plan = readFileSync("src/server/credit-reports/action-plan.ts", "utf8");
  check("el plan no usa el reloj para la edad", !plan.includes("Date.now()"));
  check("una edad ausente no hace pasar la fila", plan.includes("row.ageOk === true") && !plan.includes("ageOk === null"));
  check("el umbral de 3 consultas ya no decide", !plan.includes("INQUIRIES_MAX"));
  check("la versión queda fija", TEMPORAL_VERSION === "t10-2026-10-20");

  console.log("\nOK credit-temporal\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
