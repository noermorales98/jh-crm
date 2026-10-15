/**
 * TEST-010 / JH-010 — N/A ≠ 0; contradicciones no auto-disputa.
 */
import {
  findBalanceContradictions,
  parseNumericField,
  shouldAutoDisputeOnContradiction,
} from "../../src/lib/credit/provenance";

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

console.log("\n[TEST-010] credit field provenance");

const prov = { source: "PDF_EXTRACT" as const, bureau: "EQUIFAX" as const, page: 12 };

const zero = parseNumericField("0", prov);
check("cero es 0", zero.value === 0 && !zero.isNotApplicable);

const na = parseNumericField("N/A", prov);
check("N/A es null + flag", na.value === null && na.isNotApplicable);

const blank = parseNumericField("—", { ...prov, page: 3 });
check("em-dash N/A", blank.value === null && blank.isNotApplicable);

const money = parseNumericField("$1,250.00", prov);
check("money parse", money.value === 1250);

const contradictions = findBalanceContradictions([
  {
    bureau: "EQUIFAX",
    balance: parseNumericField(100, { source: "PDF_EXTRACT", bureau: "EQUIFAX", page: 1 }),
  },
  {
    bureau: "EXPERIAN",
    balance: parseNumericField(200, { source: "PDF_EXTRACT", bureau: "EXPERIAN", page: 1 }),
  },
  {
    bureau: "TRANSUNION",
    balance: parseNumericField("N/A", {
      source: "PDF_EXTRACT",
      bureau: "TRANSUNION",
      page: 1,
    }),
  },
]);
check("contradicción detectada", contradictions.length === 1);
check("sin auto-disputa", shouldAutoDisputeOnContradiction() === false);

const consistent = findBalanceContradictions([
  {
    bureau: "EQUIFAX",
    balance: parseNumericField(50, { source: "MANUAL", bureau: "EQUIFAX" }),
  },
  {
    bureau: "EXPERIAN",
    balance: parseNumericField(50, { source: "MANUAL", bureau: "EXPERIAN" }),
  },
]);
check("sin contradicción si iguales", consistent.length === 0);

console.log("\nOK credit-field-provenance (TEST-010)\n");
