/**
 * TEST — ventanas + merge + scores (sin OpenRouter / sin S3).
 * Uso: npx tsx scripts/smoke/credit-pdf-chunk-merge.ts
 *      npm run smoke:credit-pdf-chunk-merge
 */
import {
  AI_MAX_WINDOWS,
  buildExtractionWindows,
  coerceExtractionRaw,
  extractScoreSnapshotsFromText,
  findScoreAnchorIndex,
  mergeExtractionProposals,
  mergeHeuristicScores,
  splitTextWindows,
} from "../../src/server/credit-import/extract";
import type { CreditPdfExtractionProposal } from "../../src/lib/validation/credit-import";
import { creditPdfExtractionProposalSchema } from "../../src/lib/validation/credit-import";

let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    console.error(`  ✗ ${label}`);
    failed += 1;
  }
}

console.log("\n[credit-pdf-chunk-merge] ventanas + merge + scores");

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

// —— Score window / coerce / heuristic ——
const sample =
  "Review credit scores and ratings. Equifax1 648 Fair Experian2 718 Excellent TransUnion3 721 Good. More accounts follow…";
check("findScoreAnchorIndex hits credit score", findScoreAnchorIndex(sample) >= 0);

const heur = extractScoreSnapshotsFromText(sample);
check("heuristic finds 3 bureaus", heur.length === 3);
check(
  "heuristic Equifax 648",
  heur.find((s) => s.bureau === "EQUIFAX")?.score === 648,
);
check(
  "heuristic Experian 718",
  heur.find((s) => s.bureau === "EXPERIAN")?.score === 718,
);
check(
  "heuristic TransUnion 721",
  heur.find((s) => s.bureau === "TRANSUNION")?.score === 721,
);

const padded = `${"x".repeat(20_000)} Credit Score and Rating ${sample} ${"y".repeat(40_000)}`;
const built = buildExtractionWindows(padded);
check("buildExtractionWindows ≤ max", built.windows.length <= AI_MAX_WINDOWS);
check("score window reserved", built.scoreWindowIndex != null);
if (built.scoreWindowIndex != null) {
  check(
    "score window contains sample scores",
    built.windows[built.scoreWindowIndex].includes("648") &&
      built.windows[built.scoreWindowIndex].includes("Experian"),
  );
}

const oversizedRaw = {
  documentKind: "CREDIT_BUREAU_REPORT",
  confidence: "medium",
  warnings: [],
  client: null,
  report: {
    snapshots: [
      { bureau: "EXPERIAN", score: 700 },
      { bureau: "EQUIFAX", score: 690 },
      { bureau: "TRANSUNION", score: 710 },
      { bureau: "EXPERIAN", score: 701 }, // 4th would fail Zod max(3)
    ],
    items: [],
  },
  progress: null,
};
const coerced = coerceExtractionRaw(oversizedRaw);
const salvaged = creditPdfExtractionProposalSchema.safeParse(coerced);
check("coerce oversized snapshots → valid", salvaged.success);
check(
  "coerce keeps ≤3 snapshots",
  (salvaged.success ? salvaged.data.report?.snapshots?.length ?? 99 : 99) <= 3,
);
check(
  "coerce keeps Experian score",
  Boolean(
    salvaged.success &&
      salvaged.data.report?.snapshots?.some(
        (s) => s.bureau === "EXPERIAN" && s.score === 700,
      ),
  ),
);

const emptyScores: CreditPdfExtractionProposal = {
  documentKind: "CREDIT_BUREAU_REPORT",
  confidence: "medium",
  warnings: [],
  client: null,
  report: { snapshots: [], items: [] },
  progress: null,
};
const filled = mergeHeuristicScores(emptyScores, sample);
check("mergeHeuristicScores fills 3", filled.report?.snapshots?.length === 3);
check(
  "mergeHeuristicScores warning present",
  (filled.warnings ?? []).some((w) => w.toLowerCase().includes("heurística")),
);

if (failed > 0) {
  console.error(`\nFAIL credit-pdf-chunk-merge (${failed})`);
  process.exit(1);
}
console.log("\nOK credit-pdf-chunk-merge\n");
