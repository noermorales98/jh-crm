/**
 * Smoke SPRINT 3 — plantillas, cartas (HTML + PDF on-demand) y reportes de progreso.
 *
 *   npx tsx --env-file=.env.local scripts/smoke/letters-smoke.ts
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as rounds from "../../src/server/rounds";
import * as creditReports from "../../src/server/credit-reports";
import * as disputes from "../../src/server/disputes";
import * as letters from "../../src/server/letters";
import { renderTemplate } from "../../src/lib/letters/template";
import * as progress from "../../src/server/progress-reports";

const prisma = new PrismaClient();
const MARK = "LTR-SMOKE";
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { name: "J&H Multiservices LLC" },
  });
  const owner = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: "OWNER" },
  });
  const ctx: OrganizationContext = {
    userId: owner.userId,
    organizationId: org.id,
    role: "OWNER",
  };
  const stage = await prisma.workflowStage.findFirstOrThrow({
    where: { organizationId: org.id, key: "ANALYSIS" },
  });

  let clientId: string | null = null;
  let caseId: string | null = null;

  try {
    console.log("\n[0] Template render");
    check(
      "render variables",
      renderTemplate("Hola {{client.fullName}} — {{bureau}}", {
        "client.fullName": "Ana",
        bureau: "Experian",
      }) === "Hola Ana — Experian",
    );

    console.log("\n[1] Caso + disputa");
    const client = await clients.createClient(ctx, {
      firstName: `${MARK} Ana`,
      lastName: "Cartas",
      addressLine1: "100 Main St",
      city: "Houston",
      state: "TX",
      postalCode: "77002",
    });
    clientId = client.id;
    const creditCase = await cases.createCreditCase(ctx, {
      clientId: client.id,
      stageId: stage.id,
    });
    caseId = creditCase.id;

    const report = await creditReports.createCreditReport(ctx, {
      caseId: creditCase.id,
      type: "INITIAL",
      reportDate: new Date("2026-02-01"),
      snapshots: [{ bureau: "EXPERIAN", score: 550 }],
      items: [
        {
          creditorName: "Smoke Collect",
          accountNumberMasked: "****9999",
          bureau: "EXPERIAN",
          negativeType: "COLLECTION",
          isNegative: true,
        },
      ],
    });
    const detail = await creditReports.getReportDetail(ctx, report.id);
    const round = await rounds.createRound(ctx, { caseId: creditCase.id });
    await disputes.addDisputeItem(ctx, {
      roundId: round.id,
      creditItemId: detail.items[0].id,
      disputeReason: "Not mine",
    });
    const summary = await disputes.getRoundDisputeSummary(ctx, round.id);

    console.log("\n[2] Templates + draft letter");
    const templates = await letters.ensureDefaultTemplates(ctx);
    check("plantilla default", templates.length >= 1);

    const preview = await letters.previewLetter(ctx, {
      roundId: round.id,
      bureau: "EXPERIAN",
      templateId: templates[0].id,
      disputeItemIds: [summary.items[0].id],
    });
    check("preview tiene nombre", preview.content.includes("Ana"));
    check("preview tiene acreedor", preview.content.includes("Smoke Collect"));

    const draft = await letters.createLetterDraft(ctx, {
      roundId: round.id,
      bureau: "EXPERIAN",
      templateId: templates[0].id,
      disputeItemIds: [summary.items[0].id],
      content: preview.content,
      subject: preview.subject,
    });
    check("draft READY_FOR_REVIEW", draft.status === "READY_FOR_REVIEW");

    const roundAfter = await prisma.creditRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    check("lettersCount sync", roundAfter.lettersCount === 1);

    console.log("\n[3] Finalize (sin S3) + PDF on-demand + progress snapshot");
    const finalized = await letters.finalizeLetter(ctx, draft.id);
    check("status FINAL", finalized.letter.status === "FINAL");
    check("sin documentId", finalized.letter.documentId == null);

    const letterPdf = await letters.buildLetterPdf(ctx, draft.id);
    check("letter PDF bytes", letterPdf.pdf.byteLength > 100);
    check("letter PDF name", letterPdf.filename.endsWith(".pdf"));

    const prog = await progress.createClientProgressReport(ctx, {
      caseId: creditCase.id,
      roundId: round.id,
    });
    check("progress snapshot id", Boolean(prog.id));

    const listed = await progress.listProgressReportsForCase(ctx, creditCase.id);
    check("progress en historial", listed.some((r) => r.id === prog.id));

    const progPdf = await progress.buildProgressReportPdf(ctx, prog.id);
    check("progress PDF bytes", progPdf.pdf.byteLength > 100);
    check("progress PDF name", progPdf.filename.endsWith(".pdf"));
  } finally {
    if (caseId) {
      await prisma.disputeLetterItem.deleteMany({
        where: { letter: { round: { caseId } } },
      });
      await prisma.disputeLetter.deleteMany({ where: { round: { caseId } } });
      await prisma.disputeItem.deleteMany({ where: { round: { caseId } } });
      await prisma.clientProgressReport.deleteMany({ where: { caseId } });
      await prisma.document.deleteMany({ where: { caseId } });
      await prisma.creditItem.deleteMany({ where: { caseId } });
      await prisma.creditBureauSnapshot.deleteMany({
        where: { report: { caseId } },
      });
      await prisma.creditReport.deleteMany({ where: { caseId } });
      await prisma.activityLog.deleteMany({ where: { caseId } });
      await prisma.creditRound.deleteMany({ where: { caseId } });
      await prisma.creditCase.delete({ where: { id: caseId } }).catch(() => undefined);
    }
    if (clientId) {
      await prisma.activityLog.deleteMany({ where: { clientId } });
      await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
    }
  }

  console.log(`\nResultado: ${passed} ok, ${failed} fallos`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
