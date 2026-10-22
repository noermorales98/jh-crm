/**
 * Score Plan: monto solo con límite y saldo conocidos.
 *
 *   npm run smoke:score-plan
 *
 * Sin red y sin DATABASE_URL.
 */
import {
  SCORE_PLAN_EMPTY_COPY,
  SCORE_PLAN_INSUFFICIENT_LABEL,
  SCORE_PLAN_REVIEW_NOTE,
  SCENARIO_VERSION,
  buildScorePlan,
  buildUtilizationScenario,
  formatScorePlanCopy,
  paydownCents,
  type ScenarioAccount,
  type ScorePlanAccount,
} from "../../src/lib/credit/score-plan";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function account(
  creditorName: string,
  limit: number | null,
  balance: number | null,
): ScorePlanAccount {
  return { creditorName, limit, balance, utilization: null };
}

function main() {
  console.log("\n[score-plan] buildScorePlan + texto copiado");

  const empty = buildScorePlan([], 10);
  check("sin cuentas → lista vacía", empty.length === 0);
  const emptyCopy = formatScorePlanCopy(empty, 10);
  check(
    "sin cuentas no copia un monto y pide revisión",
    emptyCopy === `${SCORE_PLAN_EMPTY_COPY}\n${SCORE_PLAN_REVIEW_NOTE}` &&
      !emptyCopy.includes("$"),
    emptyCopy,
  );

  const payDown = buildScorePlan([account("Tarjeta Alfa", 10_000, 8_000)], 10);
  check("límite 10000 / saldo 8000 / meta 10% → una fila", payDown.length === 1);
  check(
    "pago $7,000 y 80%",
    payDown[0]?.kind === "ready" &&
      payDown[0].amount === 7_000 &&
      payDown[0].pct === 80,
    payDown[0],
  );
  const payDownCopy = formatScorePlanCopy(payDown, 10);
  check(
    "copia el monto calculado y pide revisión",
    payDownCopy ===
      `Tarjeta Alfa: ahora 80% · $7,000 (meta 10%)\n${SCORE_PLAN_REVIEW_NOTE}`,
    payDownCopy,
  );

  const alreadyUnder = buildScorePlan(
    [account("Tarjeta Alfa", 10_000, 500)],
    10,
  );
  check(
    "saldo 500 bajo la meta → $0",
    alreadyUnder[0]?.kind === "ready" &&
      alreadyUnder[0].amount === 0 &&
      alreadyUnder[0].pct === 5,
    alreadyUnder[0],
  );
  check(
    "un $0 calculado sí se copia",
    formatScorePlanCopy(alreadyUnder, 10).includes("$0"),
    formatScorePlanCopy(alreadyUnder, 10),
  );

  const missingBalance = buildScorePlan(
    [account("Tarjeta Beta", 10_000, null)],
    10,
  );
  check(
    "saldo null → datos insuficientes, sin porcentaje ni monto",
    missingBalance[0]?.kind === "insufficient" &&
      !("pct" in missingBalance[0]) &&
      !("amount" in missingBalance[0]),
    missingBalance[0],
  );

  const missingLimit = buildScorePlan(
    [account("Tarjeta Gamma", null, 4_000)],
    10,
  );
  check(
    "límite null → datos insuficientes",
    missingLimit[0]?.kind === "insufficient",
    missingLimit[0],
  );
  const missingCopy = formatScorePlanCopy(missingLimit, 10);
  check(
    "límite null no copia un dólar y pide revisión",
    missingCopy ===
      `Tarjeta Gamma: ${SCORE_PLAN_INSUFFICIENT_LABEL}\n${SCORE_PLAN_REVIEW_NOTE}` &&
      !missingCopy.includes("$"),
    missingCopy,
  );

  const contradicted = buildScorePlan(
    [
      {
        creditorName: "Tarjeta Alfa",
        limit: 10_000,
        balance: 8_000,
        utilization: 12,
      },
    ],
    10,
  );
  check(
    "utilización recibida distinta no cambia el porcentaje",
    contradicted[0]?.kind === "ready" &&
      contradicted[0].pct === 80 &&
      contradicted[0].amount === 7_000,
    contradicted[0],
  );

  const mixed = buildScorePlan(
    [
      account("Tarjeta Alfa", 10_000, 8_000),
      account("Tarjeta Gamma", null, 4_000),
    ],
    10,
  );
  check("mezcla conserva las dos filas y el orden", mixed.length === 2);
  check(
    "mezcla: calculable y luego insuficiente",
    mixed[0]?.kind === "ready" &&
      mixed[0].amount === 7_000 &&
      mixed[1]?.kind === "insufficient" &&
      mixed[1].name === "Tarjeta Gamma",
    mixed,
  );
  const mixedCopy = formatScorePlanCopy(mixed, 10);
  check(
    "mezcla: dólar solo en la fila calculable",
    mixedCopy ===
      `Tarjeta Alfa: ahora 80% · $7,000 (meta 10%)\nTarjeta Gamma: Datos insuficientes\n${SCORE_PLAN_REVIEW_NOTE}`,
    mixedCopy,
  );
  check(
    "la fila insuficiente de la mezcla no lleva $",
    !mixedCopy.split("\n")[1]?.includes("$"),
    mixedCopy,
  );

  const atThirty = buildScorePlan(
    [account("Tarjeta Alfa", 10_000, 8_000)],
    30,
  );
  check(
    "meta 30% → $5,000",
    atThirty[0]?.kind === "ready" && atThirty[0].amount === 5_000,
    atThirty[0],
  );
  check(
    "copia anuncia la meta 30%",
    formatScorePlanCopy(atThirty, 30) ===
      `Tarjeta Alfa: ahora 80% · $5,000 (meta 30%)\n${SCORE_PLAN_REVIEW_NOTE}`,
    formatScorePlanCopy(atThirty, 30),
  );

  check("versión del escenario", SCENARIO_VERSION === "t13-2026-10-21");
  const abc: ScenarioAccount[] = [
    { canonicalId: "A", creditorName: "A", balanceCents: 800_000, limitCents: 1_000_000, currency: "USD" },
    { canonicalId: "B", creditorName: "B", balanceCents: 50_000, limitCents: 500_000, currency: "USD" },
    { canonicalId: "C", creditorName: "C", balanceCents: 0, limitCents: 500_000, currency: "USD" },
  ];
  const split = buildUtilizationScenario({
    snapshotId: "snap",
    targetBps: 1_000,
    aggregateStatus: "KNOWN",
    accounts: abc,
  });
  check(
    "por tarjeta A/B/C al 10% suman 700000 centavos",
    split.perAccountTotalCents === 700_000 &&
      split.perAccountPaydownCents[0]?.payment === 700_000 &&
      split.perAccountPaydownCents[1]?.payment === 0 &&
      split.perAccountPaydownCents[2]?.payment === 0,
    split,
  );
  check(
    "el conjunto 8500 sobre 20000 pide 650000 centavos",
    split.aggregatePaydownCents === 650_000 && split.difference != null,
    split,
  );
  check("el escenario no predice puntos", split.scorePrediction === null);

  const atZero = buildUtilizationScenario({
    snapshotId: "snap",
    targetBps: 0,
    aggregateStatus: "KNOWN",
    accounts: [abc[0]!],
  });
  check("meta 0 paga el saldo", atZero.aggregatePaydownCents === 800_000 && atZero.scorePrediction === null);
  const atFull = buildUtilizationScenario({
    snapshotId: "snap",
    targetBps: 10_000,
    aggregateStatus: "KNOWN",
    accounts: [abc[0]!],
  });
  check("meta 100% paga 0 si el saldo no pasa el límite", atFull.aggregatePaydownCents === 0);

  check("límite null no calcula", paydownCents(400_000, null, 1_000) === null);
  check("límite cero no calcula", paydownCents(400_000, 0, 1_000) === null);
  check(
    "saldo sobre el límite no pide más que el saldo",
    paydownCents(1_200_000, 1_000_000, 1_000) === 1_100_000,
  );
  const mixedCurrency = buildUtilizationScenario({
    snapshotId: "snap",
    targetBps: 1_000,
    aggregateStatus: "KNOWN",
    accounts: [
      abc[0]!,
      { ...abc[1]!, currency: "EUR" },
    ],
  });
  check("moneda distinta deja el conjunto en null", mixedCurrency.aggregatePaydownCents === null && mixedCurrency.scorePrediction === null);
  const partial = buildUtilizationScenario({
    snapshotId: "snap",
    targetBps: 1_000,
    aggregateStatus: "PARTIAL",
    accounts: abc,
  });
  check("agregado parcial deja el conjunto en null", partial.aggregatePaydownCents === null && partial.perAccountTotalCents === 700_000);
  check(
    "un centavo al 50% usa el piso 0",
    paydownCents(1, 1, 5_000) === 1,
  );
  check("saldo cero paga 0", paydownCents(0, 100, 5_000) === 0);
  const dated = buildUtilizationScenario({
    snapshotId: "snap",
    targetBps: 1_000,
    aggregateStatus: "KNOWN",
    accounts: [{ ...abc[0]!, balanceReportedOn: "2026-10-01", statementClose: null, dueDate: null }],
  });
  check(
    "solo muestra la fecha que vino",
    dated.perAccountPaydownCents[0]?.balanceReportedOn === "2026-10-01" &&
      dated.perAccountPaydownCents[0]?.statementClose === null &&
      dated.perAccountPaydownCents[0]?.dueDate === null,
  );

  console.log("\nOK score-plan\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
