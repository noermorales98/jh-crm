/**
 * Anomalías: diferencia descrita, sin prueba de error y sin disputa.
 *
 *   npm run smoke:credit-anomalies
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  ANOMALY_VERSION,
  buildAnomalyReading,
  negativeListed,
  type AnomalyObservation,
} from "../../src/lib/credit/anomalies";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function observation(patch: Partial<AnomalyObservation> & Pick<AnomalyObservation, "id" | "bureau">): AnomalyObservation {
  return {
    canonicalId: "visa",
    identityStatus: "CONFIRMED",
    creditorName: "Visa",
    balanceCents: 0,
    dateReported: "2026-10-01",
    responsibility: "individual",
    ownershipConfirmed: true,
    paymentStatus: "current",
    isNegative: false,
    negativeType: null,
    ...patch,
  };
}

function main() {
  console.log("\n[credit-anomalies] buildAnomalyReading");
  check("versión", ANOMALY_VERSION === "t15-2026-10-21");

  const pair = [
    observation({ id: "exp", bureau: "EXPERIAN", balanceCents: 432_000, dateReported: "2026-10-01" }),
    observation({ id: "eq", bureau: "EQUIFAX", balanceCents: 0, dateReported: "2026-10-15" }),
  ];
  const sameMonth = buildAnomalyReading({ coverage: "COMPLETE", negativeCount: 0, observations: pair });
  const balance = sameMonth.anomalies.find((item) => item.kind === "VALUE_DISCREPANCY");
  check(
    "4320 contra 0 se describe y no prueba error",
    balance?.describedDeltaCents === 432_000 &&
      balance.temporalComparability === "COMPARABLE" &&
      balance.provesInaccuracy === false &&
      balance.reviewRequired === true &&
      pair[0]?.balanceCents === 432_000,
    balance,
  );

  const dated = buildAnomalyReading({
    coverage: "COMPLETE",
    negativeCount: 0,
    observations: [
      observation({ id: "exp", bureau: "EXPERIAN", balanceCents: 432_000, dateReported: "2026-09-01" }),
      observation({ id: "eq", bureau: "EQUIFAX", balanceCents: 0, dateReported: "2026-10-01" }),
    ],
  });
  check(
    "meses distintos no son el mismo momento",
    dated.anomalies.find((item) => item.kind === "VALUE_DISCREPANCY")?.temporalComparability === "DIFFERENT_DATES",
    dated.anomalies,
  );

  const undated = buildAnomalyReading({
    coverage: "COMPLETE",
    negativeCount: 0,
    observations: [
      observation({ id: "exp", bureau: "EXPERIAN", balanceCents: 432_000, dateReported: null }),
      observation({ id: "eq", bureau: "EQUIFAX", balanceCents: 0, dateReported: "2026-10-01" }),
    ],
  });
  check(
    "sin fecha la comparación queda UNKNOWN",
    undated.anomalies.find((item) => item.kind === "VALUE_DISCREPANCY")?.temporalComparability === "UNKNOWN",
  );

  const late = buildAnomalyReading({
    coverage: "COMPLETE",
    negativeCount: 1,
    observations: [
      observation({ id: "exp", bureau: "EXPERIAN", paymentStatus: "30 late", isNegative: true, negativeType: "LATE_PAYMENT" }),
      observation({ id: "eq", bureau: "EQUIFAX", paymentStatus: "current" }),
    ],
  });
  const history = late.anomalies.find((item) => item.kind === "PAYMENT_HISTORY_CONFLICT");
  check(
    "30 late contra current conserva los dos textos",
    history?.temporalComparability === "COMPARABLE" &&
      history.values.includes("30 late") &&
      history.values.includes("current") &&
      history.provesInaccuracy === false,
    history,
  );

  const missingHistory = buildAnomalyReading({
    coverage: "COMPLETE",
    negativeCount: 0,
    observations: [
      observation({ id: "exp", bureau: "EXPERIAN", paymentStatus: null, balanceCents: 100 }),
      observation({ id: "eq", bureau: "EQUIFAX", paymentStatus: "current", balanceCents: 100 }),
    ],
  });
  check(
    "un historial ausente no se rellena como current",
    !missingHistory.anomalies.some((item) => item.kind === "PAYMENT_HISTORY_CONFLICT"),
    missingHistory.anomalies,
  );

  const partial = buildAnomalyReading({ coverage: "PARTIAL", negativeCount: 0, observations: [] });
  const unknown = buildAnomalyReading({ coverage: "UNKNOWN", negativeCount: 0, observations: [] });
  const listed = buildAnomalyReading({ coverage: "COMPLETE", negativeCount: 0, observations: [] });
  check(
    "cobertura parcial o desconocida no es sin negativos",
    partial.negativeReading === "UNKNOWN" &&
      unknown.negativeReading === "UNKNOWN" &&
      negativeListed("PARTIAL", 0) === null &&
      negativeListed("UNKNOWN", 0) === null &&
      listed.negativeReading === "NONE_LISTED" &&
      negativeListed("COMPLETE", 0) === true &&
      negativeListed("COMPLETE", 2) === false,
  );

  const chargeOff = [
    observation({
      id: "exp",
      bureau: "EXPERIAN",
      balanceCents: 50_000,
      paymentStatus: "Charge-off",
      isNegative: true,
      negativeType: "CHARGE_OFF",
    }),
    observation({
      id: "eq",
      bureau: "EQUIFAX",
      balanceCents: 50_000,
      paymentStatus: "Charge-off",
      isNegative: true,
      negativeType: "CHARGE_OFF",
    }),
  ];
  const chargeReading = buildAnomalyReading({ coverage: "COMPLETE", negativeCount: 2, observations: chargeOff });
  check(
    "un charge-off igual sigue negativo y no abre anomalía",
    chargeReading.anomalies.length === 0 &&
      chargeReading.negativeReading === "PRESENT" &&
      chargeOff.every((item) => item.isNegative && item.negativeType === "CHARGE_OFF"),
    chargeReading.anomalies,
  );

  const ownership = buildAnomalyReading({
    coverage: "COMPLETE",
    negativeCount: 0,
    observations: [
      observation({ id: "exp", bureau: "EXPERIAN", responsibility: "individual", balanceCents: 100 }),
      observation({
        id: "eq",
        bureau: "EQUIFAX",
        responsibility: "authorized user",
        balanceCents: 100,
      }),
    ],
  });
  const conflict = ownership.anomalies.find((item) => item.kind === "OWNERSHIP_CONFLICT");
  check(
    "ownership confirmado y distinto conserva los dos textos",
    conflict?.provesInaccuracy === false &&
      conflict.values.includes("individual") &&
      conflict.values.includes("authorized user"),
    conflict,
  );

  const named = buildAnomalyReading({
    coverage: "COMPLETE",
    negativeCount: 0,
    observations: [
      observation({ id: "exp", bureau: "EXPERIAN", creditorName: "AU Bank", responsibility: "individual", balanceCents: 100 }),
      observation({ id: "eq", bureau: "EQUIFAX", creditorName: "AU Bank", responsibility: "individual", balanceCents: 100 }),
    ],
  });
  check(
    "el nombre del acreedor no crea un conflicto",
    !named.anomalies.some((item) => item.kind === "OWNERSHIP_CONFLICT"),
  );

  const panel = readFileSync("src/components/clients/client-negative-analysis-panel.tsx", "utf8");
  const plan = readFileSync("src/server/credit-reports/action-plan.ts", "utf8");
  check(
    "el panel no afirma inexactitud ni abre ronda",
    panel.includes("ANOMALY_NOT_INACCURACY") &&
      panel.includes("NEGATIVES_NOT_CERTIFIED") &&
      !panel.includes("No hay cuentas negativas") &&
      !panel.includes("Abrir ronda"),
  );
  check(
    "la matriz usa negativos que bloquean (atrasos de más de 3 años no bloquean)",
    plan.includes("blockingByBureau.get(bureau) ?? 0) === 0") &&
      plan.includes("practicalNegatives(") &&
      !plan.includes("Errores o discrepancias"),
  );

  console.log("\nOK credit-anomalies\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
