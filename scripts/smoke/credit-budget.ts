/**
 * Presupuesto extra: cubetas, conservación y cuentas excluidas.
 *
 *   npm run smoke:credit-budget
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  BUDGET_POLICY,
  BUDGET_VERSION,
  allocateUtilizationBudget,
  parseExtraBudgetCents,
  type BudgetAccount,
} from "../../src/lib/credit/budget";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function account(
  canonicalId: string,
  balanceCents: number | null,
  limitCents: number | null,
  currency: string | null = "USD",
): BudgetAccount {
  return { canonicalId, creditorName: canonicalId, balanceCents, limitCents, currency };
}

const reference = [
  account("A", 800_000, 1_000_000),
  account("B", 200_000, 500_000),
  account("C", 30_000, 500_000),
];

function main() {
  console.log("\n[credit-budget] allocateUtilizationBudget");
  check("versión y política", BUDGET_VERSION === "t14-2026-10-21" && BUDGET_POLICY === "UTILIZATION_BUCKETS_V1");
  check("vacío no es cero", parseExtraBudgetCents("") === null && parseExtraBudgetCents("0") === 0);

  const before = reference.map((card) => card.balanceCents);
  const plan = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 200_000,
    aggregateStatus: "KNOWN",
    accounts: reference,
  });
  const cardA = plan.cards.find((card) => card.canonicalId === "A");
  check(
    "A queda en 600000 y se gastan 200000",
    plan.complete && cardA?.balanceCents === 600_000 && plan.spentCents === 200_000 && plan.remainingCents === 0,
    plan,
  );
  check(
    "el conjunto simulado queda en 4150 puntos básicos",
    plan.simulatedUtilizationBps === 4150 && !("scorePrediction" in plan),
    plan.simulatedUtilizationBps,
  );
  check("la entrada no cambia", reference.every((card, index) => card.balanceCents === before[index]));

  const zero = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 0,
    aggregateStatus: "KNOWN",
    accounts: reference,
  });
  check(
    "presupuesto 0 gasta 0",
    zero.spentCents === 0 &&
      zero.remainingCents === 0 &&
      zero.cards.every((card, index) => card.balanceCents === before[index] && card.paymentCents === 0),
    zero,
  );

  const large = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 2_000_000,
    aggregateStatus: "KNOWN",
    accounts: reference,
  });
  const paid = large.cards.reduce((sum, card) => sum + card.paymentCents, 0);
  check(
    "20000 extra gasta 10300 y sobran 9700",
    large.spentCents === 1_030_000 &&
      large.remainingCents === 970_000 &&
      large.spentCents + large.remainingCents === 2_000_000 &&
      paid === large.spentCents,
    large,
  );

  const tie = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 10_000,
    aggregateStatus: "KNOWN",
    accounts: [account("A", 500_000, 1_000_000), account("B", 250_000, 500_000)],
  });
  check(
    "a igual utilización paga el id menor",
    tie.cards.find((card) => card.canonicalId === "A")?.paymentCents === 10_000 &&
      tie.cards.find((card) => card.canonicalId === "B")?.paymentCents === 0,
    tie.cards,
  );

  const over = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 500_000,
    aggregateStatus: "KNOWN",
    accounts: [account("A", 1_200_000, 1_000_000)],
  });
  check(
    "saldo sobre el límite baja a 700000",
    over.cards[0]?.balanceCents === 700_000 && over.spentCents === 500_000,
    over.cards[0],
  );

  const missingLimit = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 100_000,
    aggregateStatus: "KNOWN",
    accounts: [account("A", 800_000, 1_000_000), account("D", 100, null)],
  });
  check(
    "límite ausente no publica el reparto",
    !missingLimit.complete &&
      missingLimit.cards.length === 0 &&
      missingLimit.simulatedUtilizationBps === null &&
      missingLimit.excluded.some((row) => row.canonicalId === "D" && row.reason === "MISSING_LIMIT"),
    missingLimit,
  );

  const missingBalance = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 100_000,
    aggregateStatus: "KNOWN",
    accounts: [account("A", null, 1_000_000)],
  });
  check("saldo ausente queda excluido", !missingBalance.complete && missingBalance.excluded[0]?.reason === "MISSING_BALANCE");

  const mixed = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 100_000,
    aggregateStatus: "KNOWN",
    accounts: [account("A", 800_000, 1_000_000, "USD"), account("B", 200_000, 500_000, "EUR")],
  });
  check(
    "moneda distinta no publica el reparto",
    !mixed.complete && mixed.simulatedUtilizationBps === null && mixed.excluded.every((row) => row.reason === "MIXED_CURRENCY"),
  );

  const duplicate = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 100_000,
    aggregateStatus: "KNOWN",
    accounts: [account("A", 800_000, 1_000_000), account("A", 200_000, 500_000)],
  });
  check("id repetido no publica el reparto", !duplicate.complete && duplicate.excluded.every((row) => row.reason === "DUPLICATE"));

  const partial = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 100_000,
    aggregateStatus: "PARTIAL",
    accounts: reference,
  });
  check(
    "agregado parcial no publica el reparto",
    !partial.complete && partial.cards.length === 0 && partial.excluded.length === reference.length,
  );

  const empty = allocateUtilizationBudget({
    snapshotId: "snap",
    extraBudgetCents: 50_000,
    aggregateStatus: "KNOWN",
    accounts: [],
  });
  check(
    "conjunto vacío gasta 0 y no es 0%",
    empty.complete && empty.spentCents === 0 && empty.remainingCents === 50_000 && empty.simulatedUtilizationBps === null,
    empty,
  );

  for (let index = 0; index < 300; index += 1) {
    const accounts = [account("A", index * 37, 10_000), account("B", index * 11, 5_000)];
    const original = accounts.map((card) => card.balanceCents);
    const available = index * 19;
    const out = allocateUtilizationBudget({
      snapshotId: "snap",
      extraBudgetCents: available,
      aggregateStatus: "KNOWN",
      accounts,
    });
    const holds =
      out.complete &&
      out.spentCents != null &&
      out.remainingCents != null &&
      out.spentCents <= available &&
      out.remainingCents >= 0 &&
      out.spentCents + out.remainingCents === available &&
      out.cards.reduce((sum, card) => sum + card.paymentCents, 0) === out.spentCents &&
      out.cards.every((card, cardIndex) => card.balanceCents >= 0 && card.balanceCents + card.paymentCents === original[cardIndex]) &&
      accounts.every((card, cardIndex) => card.balanceCents === original[cardIndex]);
    if (!holds) {
      check(`barrido ${index}`, false, out);
    }
  }
  check("barrido de 300 conserva el dinero", true);

  const modal = readFileSync("src/components/clients/client-score-plan-panel.tsx", "utf8");
  const pdf = readFileSync("src/lib/pdf/action-plan.ts", "utf8");
  check(
    "el modal pide el extra y no lo infiere",
    modal.includes("Presupuesto extra") && modal.includes("No se infiere del ingreso"),
  );
  check("el pdf no reparte el presupuesto", !pdf.includes("allocateUtilizationBudget"));

  console.log("\nOK credit-budget\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
