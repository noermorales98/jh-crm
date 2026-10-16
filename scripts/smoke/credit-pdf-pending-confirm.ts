/**
 * Pure smoke — pending-confirm copy + wiring (no DB).
 *   npm run smoke:credit-pdf-pending-confirm
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PENDING_CONFIRM_HINT,
  PENDING_CONFIRM_REVIEW_HEADING,
  PENDING_CONFIRM_TITLE,
} from "../../src/lib/credit/pending-confirm-copy";

const __dirname = dirname(fileURLToPath(import.meta.url));
let failed = 0;

function check(label: string, ok: boolean) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

console.log("\n[credit-pdf-pending-confirm] copy + wiring\n");

check("title mentions confirma", /confirma/i.test(PENDING_CONFIRM_TITLE));
check("hint says not auto-applied", /no se aplica solo/i.test(PENDING_CONFIRM_HINT));
check(
  "review heading",
  PENDING_CONFIRM_REVIEW_HEADING.includes("Confirma para aplicar"),
);
check(
  "no Fondify brand",
  !/fondify/i.test(`${PENDING_CONFIRM_TITLE} ${PENDING_CONFIRM_HINT}`),
);

const root = join(__dirname, "../..");
const jobsSrc = readFileSync(
  join(root, "src/server/credit-import/jobs.ts"),
  "utf8",
);
check(
  "listPendingConfirmCreditPdfJobs exported",
  jobsSrc.includes("export async function listPendingConfirmCreditPdfJobs"),
);
check(
  "pending filter excludes confirmed phase",
  jobsSrc.includes('NOT: { phase: "confirmed" }'),
);

const bannerSrc = readFileSync(
  join(root, "src/components/credit-reports/credit-pdf-pending-confirm.tsx"),
  "utf8",
);
check("banner CTA Revisar y confirmar", bannerSrc.includes("Revisar y confirmar"));

const agencySrc = readFileSync(
  join(root, "src/components/clients/agency-client-detail.tsx"),
  "utf8",
);
check(
  "Action Center wires pending banner",
  agencySrc.includes("CreditPdfPendingConfirmBanner"),
);

const creditPage = readFileSync(
  join(root, "app/crm/casos/[caseId]/credito/page.tsx"),
  "utf8",
);
check(
  "case credit page wires pending banner",
  creditPage.includes("CreditPdfPendingConfirmBanner"),
);

const progressSrc = readFileSync(
  join(root, "src/components/credit-reports/credit-pdf-import-progress.tsx"),
  "utf8",
);
check(
  "progress page uses review heading constant",
  progressSrc.includes("PENDING_CONFIRM_REVIEW_HEADING"),
);

console.log(`\nResultado: ${failed === 0 ? "PASS" : "FAIL"} (${failed} fallos)`);
if (failed > 0) process.exitCode = 1;
