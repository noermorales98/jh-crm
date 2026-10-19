/**
 * El estimado de fondeo permanece indisponible.
 *
 *   npm run smoke:funding-estimate
 *
 * Sin red y sin DATABASE_URL.
 */
import { ACTION_PLAN_HOWTO } from "../../src/lib/credit/action-plan-howto";
import {
  FUNDING_ESTIMATE_MESSAGE,
  FUNDING_ESTIMATE_REASON,
  computeFundingEstimate,
} from "../../src/lib/credit/funding-estimate";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function main() {
  console.log("\n[funding-estimate] indisponible");

  const estimate = computeFundingEstimate();
  check("status UNAVAILABLE", estimate.status === "UNAVAILABLE");
  check("amount null", estimate.amount === null);
  check(
    "reason PROGRAM_AND_VERIFIED_INPUTS_REQUIRED",
    estimate.reason === FUNDING_ESTIMATE_REASON,
  );
  check(
    "mensaje sin monto",
    !FUNDING_ESTIMATE_MESSAGE.includes("$") &&
      FUNDING_ESTIMATE_MESSAGE.includes("programa documentado"),
  );

  const catalog = JSON.stringify(ACTION_PLAN_HOWTO);
  check("catálogo sin puntos FICO", !catalog.includes("puntos FICO"));
  check("catálogo sin $15,000", !catalog.includes("$15,000") && !catalog.includes("$15K"));
  check("catálogo sin incremento +40", !catalog.includes("+40"));

  console.log("\nOK funding-estimate\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
