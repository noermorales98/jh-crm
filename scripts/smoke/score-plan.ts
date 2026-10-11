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
  buildScorePlan,
  formatScorePlanCopy,
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

  console.log("\nOK score-plan\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
