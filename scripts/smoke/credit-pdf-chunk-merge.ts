/**
 * TEST — ventanas + merge de propuestas PDF (sin OpenRouter / sin S3).
 * Uso: npx tsx scripts/smoke/credit-pdf-chunk-merge.ts
 *      npm run smoke:credit-pdf-chunk-merge
 */
import {
  AI_MAX_WINDOWS,
  mergeExtractionProposals,
  splitTextWindows,
} from "../../src/server/credit-import/extract";
import type { CreditPdfExtractionProposal } from "../../src/lib/validation/credit-import";

let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    console.error(`  ✗ ${label}`);
    failed += 1;
  }
}

console.log("\n[credit-pdf-chunk-merge] ventanas + merge");

const short = "x".repeat(1000);
check("texto corto → 1 ventana", splitTextWindows(short).length === 1);

const long = "abcdefghij".repeat(8000); // 80k
const wins = splitTextWindows(long);
check(`texto largo → ≤ ${AI_MAX_WINDOWS} ventanas`, wins.length <= AI_MAX_WINDOWS);
check("texto largo → ≥ 2 ventanas", wins.length >= 2);
check("ventana 0 empieza al inicio", wins[0].startsWith("abcdefghij"));

const partA: CreditPdfExtractionProposal = {
  documentKind: "UNKNOWN",
  confidence: "low",
  warnings: ["parcial A"],
  client: { firstName: "Ada", lastName: null },
  report: {
    reportDate: "2026-09-01",
    provider: null,
    typeHint: "UPDATE",
    notes: null,
    snapshots: [{ bureau: "EXPERIAN", score: 620 }],
    items: [
      {
        creditorName: "CAP ONE",
        accountNumberMasked: "****1111",
        bureau: "EXPERIAN",
        isNegative: true,
        negativeType: "COLLECTION",
      },
    ],
  },
  progress: null,
};

const partB: CreditPdfExtractionProposal = {
  documentKind: "CREDIT_BUREAU_REPORT",
  confidence: "high",
  warnings: ["parcial B"],
  client: { firstName: null, lastName: "López" },
  report: {
    reportDate: null,
    provider: "SmartCredit",
    typeHint: null,
    notes: null,
    snapshots: [
      { bureau: "EXPERIAN", score: null },
      { bureau: "EQUIFAX", score: 610 },
    ],
    items: [
      {
        creditorName: "CAP ONE",
        accountNumberMasked: "****1111",
        bureau: "EXPERIAN",
        isNegative: true,
        negativeType: "COLLECTION",
      },
      {
        creditorName: "OTHER BANK",
        accountNumberMasked: "****2222",
        bureau: "EQUIFAX",
        isNegative: true,
        negativeType: "CHARGE_OFF",
      },
    ],
  },
  progress: null,
};

const merged = mergeExtractionProposals([partA, partB]);
check("kind CREDIT_BUREAU_REPORT", merged.documentKind === "CREDIT_BUREAU_REPORT");
check("confidence high", merged.confidence === "high");
check("client first+last", merged.client?.firstName === "Ada" && merged.client?.lastName === "López");
check("snapshots 2 bureaus", merged.report?.snapshots?.length === 2);
check(
  "Experian score 620 conservado",
  merged.report?.snapshots?.find((s) => s.bureau === "EXPERIAN")?.score === 620,
);
check("items dedupe → 2", merged.report?.items?.length === 2);
check("provider SmartCredit", merged.report?.provider === "SmartCredit");

const fromScores = mergeExtractionProposals([
  {
    documentKind: "UNKNOWN",
    confidence: "low",
    warnings: [],
    client: null,
    report: {
      snapshots: [{ bureau: "TRANSUNION", score: 700 }],
      items: [],
    },
    progress: null,
  },
]);
check(
  "UNKNOWN+score → CREDIT_BUREAU_REPORT",
  fromScores.documentKind === "CREDIT_BUREAU_REPORT",
);

if (failed > 0) {
  console.error(`\nFAIL credit-pdf-chunk-merge (${failed})`);
  process.exit(1);
}
console.log("\nOK credit-pdf-chunk-merge\n");
