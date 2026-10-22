/**
 * Comparación de scores por modelo.
 *
 *   npm run smoke:credit-scores
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  INFORMATIONAL_SCORE_AVERAGE_LABEL,
  SCORE_COMPARISON_VERSION,
  scoreDelta,
  type ScoreObservation,
} from "../../src/lib/credit/contracts";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function obs(partial: Partial<ScoreObservation> & Pick<ScoreObservation, "value" | "scoreDate">): ScoreObservation {
  return {
    bureau: "EXPERIAN",
    family: "FICO",
    version: "8",
    variant: "CLASSIC",
    ...partial,
  };
}

function main() {
  console.log("\n[credit-scores] modelo");

  const fico = scoreDelta(
    obs({ value: 670, scoreDate: "2024-01-01" }),
    obs({ value: 695, scoreDate: "2024-06-01" }),
  );
  check("FICO 8 Experian da +25", fico.comparable && fico.delta === 25 && fico.reason === "SAME_MODEL");

  const vantage = scoreDelta(
    obs({ value: 670, scoreDate: "2024-01-01", family: "VANTAGE", version: "3" }),
    obs({ value: 695, scoreDate: "2024-06-01" }),
  );
  check("Vantage contra FICO no da delta", !vantage.comparable && vantage.delta == null && vantage.reason === "DIFFERENT_MODEL");

  const otherBureau = scoreDelta(
    obs({ value: 670, scoreDate: "2024-01-01", bureau: "EQUIFAX" }),
    obs({ value: 695, scoreDate: "2024-06-01" }),
  );
  check("otro buró no da delta", otherBureau.reason === "DIFFERENT_MODEL" && otherBureau.delta == null);

  const otherVariant = scoreDelta(
    obs({ value: 670, scoreDate: "2024-01-01", variant: "AUTO" }),
    obs({ value: 695, scoreDate: "2024-06-01", variant: "BANKCARD" }),
  );
  check("otra variante no da delta", otherVariant.reason === "DIFFERENT_MODEL" && otherVariant.delta == null);

  const noVersion = scoreDelta(
    obs({ value: 670, scoreDate: "2024-01-01", version: null }),
    obs({ value: 695, scoreDate: "2024-06-01", version: null }),
  );
  check("dos versiones null no comparan", noVersion.reason === "MISSING_MODEL" && noVersion.delta == null);

  const noDate = scoreDelta(
    obs({ value: 670, scoreDate: null }),
    obs({ value: 695, scoreDate: "2024-06-01" }),
  );
  check("sin fecha no hay delta", noDate.reason === "INVALID_DATES" && noDate.delta == null);

  const reversed = scoreDelta(
    obs({ value: 670, scoreDate: "2024-06-01" }),
    obs({ value: 695, scoreDate: "2024-01-01" }),
  );
  check("la fecha posterior primero no compara", reversed.reason === "INVALID_DATES");

  const zero = scoreDelta(
    obs({ value: 0, scoreDate: "2024-01-01" }),
    obs({ value: 695, scoreDate: "2024-06-01" }),
  );
  check("un score 0 no entra", !zero.comparable && zero.delta == null);

  const plan = readFileSync("src/server/credit-reports/action-plan.ts", "utf8");
  const view = readFileSync("src/components/clients/client-action-plan-view.tsx", "utf8");
  const pdf = readFileSync("src/lib/pdf/action-plan.ts", "utf8");
  check("el promedio no se rotula como score certificado", view.includes(INFORMATIONAL_SCORE_AVERAGE_LABEL) && pdf.includes("Score promedio informativo"));
  check("la regla de buró no usa el promedio", !plan.includes("avgScore >=") && plan.includes("score >= SCORE_MIN"));
  check("la versión queda fija", SCORE_COMPARISON_VERSION === "t09-2026-10-20");

  console.log("\nOK credit-scores\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
