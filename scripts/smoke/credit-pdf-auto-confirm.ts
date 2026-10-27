/**
 * Elegibilidad de auto-confirmación PDF (sin DB / OpenRouter).
 *
 *   npm run smoke:credit-pdf-auto-confirm
 */
import { creditPdfExtractionProposalSchema } from "../../src/lib/validation/credit-import";
import { isCreditPdfAutoConfirmEligible } from "../../src/server/credit-import/auto-confirm";

let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

console.log("\n[credit-pdf-auto-confirm]\n");

const eligible = creditPdfExtractionProposalSchema.parse({
  documentKind: "CREDIT_BUREAU_REPORT",
  confidence: "high",
  warnings: [],
  coverage: {
    pipelineVersion: "t07-test",
    status: "COMPLETE",
    plannedWindows: 1,
    validWindows: 1,
    plannedPages: 1,
    emptyPages: 0,
    omittedItems: 0,
    metricsBlocked: false,
  },
  report: {
    reportDate: "2026-09-03",
    provider: "SmartCredit",
    typeHint: "UPDATE",
    snapshots: [{ bureau: "EXPERIAN", score: 620 }],
    items: [{ creditorName: "CAPITAL ONE", bureau: "EXPERIAN", isNegative: false }],
  },
});

const ok = isCreditPdfAutoConfirmEligible(eligible);
check("proposal completa + fecha → elegible", ok.ok === true);

const blocked = creditPdfExtractionProposalSchema.parse({
  ...eligible,
  coverage: {
    ...eligible.coverage!,
    status: "PARTIAL",
    metricsBlocked: true,
  },
});
const blockedResult = isCreditPdfAutoConfirmEligible(blocked);
check(
  "metricsBlocked → no elegible",
  blockedResult.ok === false && blockedResult.reason === "metrics_blocked",
);

const noDate = creditPdfExtractionProposalSchema.parse({
  ...eligible,
  report: { ...eligible.report!, reportDate: null },
});
const noDateResult = isCreditPdfAutoConfirmEligible(noDate);
check(
  "sin reportDate → elegible (usa la fecha de subida)",
  noDateResult.ok === true,
);

if (failed > 0) {
  console.error(`\nFAIL credit-pdf-auto-confirm (${failed})\n`);
  process.exitCode = 1;
} else {
  console.log("\nOK credit-pdf-auto-confirm\n");
}
