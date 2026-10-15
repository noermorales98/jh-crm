/**
 * TEST-009 / JH-009 — suma de cuotas = total; última cuota visible con residuo.
 */
import {
  allocateInstallmentCents,
  assertInstallmentsSumToTotal,
  dollarsToCents,
} from "../../src/lib/money/installments";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

console.log("\n[TEST-009] quote installment math");

const cases: Array<[number, number]> = [
  [100, 3],
  [10.07, 3], // residuo Fondify-like
  [99.99, 7],
  [1, 2],
  [1234.56, 12],
];

for (const [dollars, n] of cases) {
  const totalCents = dollarsToCents(dollars);
  const amounts = allocateInstallmentCents(totalCents, n);
  check(
    `${dollars} / ${n} suma exacta`,
    assertInstallmentsSumToTotal(amounts, totalCents),
    amounts,
  );
  check(
    `${dollars} / ${n} n cuotas`,
    amounts.length === n,
  );
  if (n > 1) {
    const base = amounts[0]!;
    check(
      `${dollars} / ${n} primeras iguales (o última distinta)`,
      amounts.slice(0, -1).every((a) => a === base),
    );
  }
}

const weird = allocateInstallmentCents(dollarsToCents(10.07), 3);
check(
  "última cuota muestra residuo (no pierde centavos)",
  weird[2] !== weird[0] || weird.reduce((a, b) => a + b, 0) === 1007,
);

console.log("\nOK quote-installment-math (TEST-009)\n");
