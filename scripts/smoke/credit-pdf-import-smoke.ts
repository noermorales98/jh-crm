/**
 * Smoke CR-PDF-001: schemas de importación PDF (sin OpenRouter ni S3).
 * Uso: npx tsx scripts/smoke/credit-pdf-import-smoke.ts
 * Opcional: CR_PDF_FIXTURE_BUREAU / CR_PDF_FIXTURE_PROGRESS = rutas locales.
 */
import {
  creditPdfExtractionProposalSchema,
  confirmCreditPdfImportSchema,
} from "../../src/lib/validation/credit-import";
import { extractPdfContent } from "../../src/server/credit-import/pdf-text";
import { readFileSync, existsSync } from "fs";

let checks = 0;
function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  checks++;
  console.log(`  ✓ ${label}`);
}

async function main() {
  console.log("\n[CR-PDF-001] credit PDF import schemas");

  const bureauProposal = creditPdfExtractionProposalSchema.parse({
    documentKind: "CREDIT_BUREAU_REPORT",
    confidence: "high",
    warnings: [],
    client: {
      firstName: "Agustin",
      lastName: "Islas",
      dateOfBirth: "1990-01-15",
      ssnLast4: "1234",
      addressLine1: "123 Main St",
      city: "Houston",
      state: "TX",
      postalCode: "77001",
    },
    report: {
      reportDate: "2026-09-03",
      provider: "SmartCredit",
      typeHint: "UPDATE",
      snapshots: [
        { bureau: "EXPERIAN", score: 620 },
        { bureau: "EQUIFAX", score: 615 },
        { bureau: "TRANSUNION", score: 630 },
      ],
      items: [
        {
          creditorName: "CAPITAL ONE",
          bureau: "EXPERIAN",
          isNegative: true,
          negativeType: "COLLECTION",
          accountNumberMasked: "****1111",
        },
      ],
    },
    progress: null,
  });
  check(
    "bureau proposal parse",
    bureauProposal.documentKind === "CREDIT_BUREAU_REPORT" &&
      bureauProposal.report?.snapshots?.length === 3,
  );

  const progressProposal = creditPdfExtractionProposalSchema.parse({
    documentKind: "CLIENT_PROGRESS_REPORT",
    confidence: "medium",
    warnings: ["sin cuentas"],
    client: { firstName: "Agustin", lastName: "Islas" },
    report: {
      reportDate: "2026-09-03",
      provider: "Progress Report PDF",
      typeHint: "UPDATE",
      snapshots: [{ bureau: "EXPERIAN", score: 640 }],
      items: [],
    },
    progress: { periodLabel: "September 2026", nextSteps: "Continue disputes" },
  });
  check(
    "progress proposal parse",
    progressProposal.documentKind === "CLIENT_PROGRESS_REPORT",
  );

  confirmCreditPdfImportSchema.parse({
    caseId: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
    documentId: "clxxxxxxxxxxxxxxxxxxxxxxxx2",
    documentKind: "CREDIT_BUREAU_REPORT",
    reportType: "UPDATE",
    reportDate: "2026-09-03",
    provider: "SmartCredit",
    snapshots: bureauProposal.report!.snapshots,
    items: bureauProposal.report!.items,
    applyClientFields: { firstName: true, ssn: false },
    clientPatch: bureauProposal.client,
    overwriteClient: false,
  });
  check("confirm schema", true);

  check(
    "rejects full SSN in proposal client",
    creditPdfExtractionProposalSchema.safeParse({
      documentKind: "UNKNOWN",
      client: { ssnLast4: "123456789" },
    }).success === false,
  );

  const paths = [
    process.env.CR_PDF_FIXTURE_BUREAU,
    process.env.CR_PDF_FIXTURE_PROGRESS,
  ].filter((p): p is string => Boolean(p && existsSync(p)));

  if (paths.length) {
    console.log("\n[optional local PDF text extract]");
    for (const p of paths) {
      const buf = readFileSync(p);
      const r = await extractPdfContent(buf);
      check(`extract ${p.split("/").pop()}`, r.pageCount > 0 && r.charCount > 0);
      console.log(
        `    pages=${r.pageCount} mode=${r.mode} chars=${r.charCount}`,
      );
    }
  }

  console.log(`CR-PDF-001: ${checks}/${checks} OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
