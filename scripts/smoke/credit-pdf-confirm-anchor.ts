/**
 * Smoke: confirm anclado a proposalJson (snapshots/items/identities).
 *   npm run smoke:credit-pdf-confirm-anchor
 */
import {
  assertIdentityDecisionIdsAllowed,
  identitiesFromProposal,
  resolveConfirmPayloadFromProposal,
} from "../../src/lib/credit/confirm-proposal";
import { identityDecisionId } from "../../src/lib/credit/review";
import {
  confirmCreditPdfImportSchema,
  creditPdfExtractionProposalSchema,
} from "../../src/lib/validation/credit-import";
import { DomainError } from "../../src/server/errors";
import { readFileSync } from "node:fs";

let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

console.log("\n[credit-pdf-confirm-anchor]\n");

const proposal = creditPdfExtractionProposalSchema.parse({
  documentKind: "CREDIT_BUREAU_REPORT",
  confidence: "high",
  warnings: [],
  identities: [
    {
      observationIds: ["obs-a", "obs-b"],
      canonicalId: "can-1",
      status: "PROPOSED",
      signals: [],
      conflicts: [],
      reviewedBy: null,
      identityVersion: 1,
    },
  ],
  report: {
    reportDate: "2026-09-03",
    provider: "SmartCredit",
    typeHint: "UPDATE",
    snapshots: [
      { bureau: "EXPERIAN", score: 620 },
      { bureau: "EQUIFAX", score: 615 },
    ],
    items: [
      {
        creditorName: "CAPITAL ONE",
        bureau: "EXPERIAN",
        isNegative: true,
        negativeType: "COLLECTION",
      },
      {
        creditorName: "AMEX",
        bureau: "EQUIFAX",
        isNegative: false,
      },
    ],
  },
});

const all = resolveConfirmPayloadFromProposal({
  proposal,
  documentKind: "CREDIT_BUREAU_REPORT",
});
check("usa snapshots de la propuesta", all.snapshots.length === 2);
check("usa todos los items si no hay índices", all.items.length === 2);

const subset = resolveConfirmPayloadFromProposal({
  proposal,
  documentKind: "CREDIT_BUREAU_REPORT",
  selectedItemIndexes: [1],
});
check("índices seleccionan subset", subset.items.length === 1 && subset.items[0]!.creditorName === "AMEX");

let badIndex = false;
try {
  resolveConfirmPayloadFromProposal({
    proposal,
    documentKind: "CREDIT_BUREAU_REPORT",
    selectedItemIndexes: [99],
  });
} catch (error) {
  badIndex = error instanceof DomainError;
}
check("índice inventado falla", badIndex);

const identities = identitiesFromProposal(proposal);
const allowedId = identityDecisionId(identities[0]!);
assertIdentityDecisionIdsAllowed(identities, [allowedId]);
check("identityDecisionId de la propuesta pasa", true);

let spoof = false;
try {
  assertIdentityDecisionIdsAllowed(identities, ["spoofed-id"]);
} catch (error) {
  spoof = error instanceof DomainError;
}
check("identityDecisionId spoofeado falla", spoof);

const emptyIds = identitiesFromProposal({
  ...proposal,
  identities: [],
});
let spoofEmpty = false;
try {
  assertIdentityDecisionIdsAllowed(emptyIds, ["anything"]);
} catch (error) {
  spoofEmpty = error instanceof DomainError;
}
check("sin identidades en propuesta, cualquier id falla", spoofEmpty);

confirmCreditPdfImportSchema.parse({
  caseId: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
  documentId: "clxxxxxxxxxxxxxxxxxxxxxxxx2",
  documentKind: "CREDIT_BUREAU_REPORT",
  reportType: "UPDATE",
  reportDate: "2026-09-03",
  selectedItemIndexes: [0],
});
check("confirm schema acepta selectedItemIndexes", true);

const confirmSrc = readFileSync("src/server/credit-import/index.ts", "utf8");
check(
  "confirm ancla a proposalJson helpers",
  confirmSrc.includes("resolveConfirmPayloadFromProposal") &&
    confirmSrc.includes("assertIdentityDecisionIdsAllowed") &&
    confirmSrc.includes("identitiesFromProposal") &&
    confirmSrc.includes("creditReport.deleteMany"),
);

const portalAuth = readFileSync("src/server/portal/index.ts", "utf8");
check(
  "authenticatePortal fail-closed multi-org",
  portalAuth.includes("candidates.length > 1") &&
    portalAuth.includes("return null"),
);

const proposalShared = readFileSync(
  "src/server/credit-import/proposal-from-document.ts",
  "utf8",
);
check(
  "pipeline PDF compartido sync/async",
  proposalShared.includes("buildProposalFromDocumentBytes") &&
    confirmSrc.includes("buildProposalFromDocumentBytes"),
);

if (failed) {
  console.error(`\nFAIL credit-pdf-confirm-anchor (${failed})\n`);
  process.exitCode = 1;
} else {
  console.log("\nOK credit-pdf-confirm-anchor\n");
}
