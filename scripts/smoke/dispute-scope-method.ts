/**
 * PR-RD-FLAGS — scope/method en DisputeItem (default fuera de alcance).
 *
 *   npm run smoke:dispute-flags
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as rounds from "../../src/server/rounds";
import * as creditReports from "../../src/server/credit-reports";
import * as disputes from "../../src/server/disputes";
import { DEFAULT_DISPUTE_SCOPE } from "../../src/lib/validation/disputes";
import { classifyPair } from "../../src/server/comparisons";

const prisma = new PrismaClient();
const MARK = "RD-FLAGS";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Falta DATABASE_URL (sandbox).");
  }

  console.log("\n[PR-RD-FLAGS] scope + method");

  check(
    "comparación no usa 'funcionó'",
    classifyPair(
      {
        id: "1",
        creditorName: "A",
        accountNumberMasked: "****1",
        bureau: "EXPERIAN",
        balance: null,
        accountStatus: null,
        paymentStatus: null,
        remarks: null,
      },
      undefined,
    ) === "DELETED",
  );

  const member = await prisma.organizationMember.findFirstOrThrow({
    where: { role: { in: ["OWNER", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { userId: true, organizationId: true, role: true },
  });

  const ctx: OrganizationContext = {
    userId: member.userId,
    organizationId: member.organizationId,
    role: member.role,
  };

  const stage = await prisma.workflowStage.findFirstOrThrow({
    where: { organizationId: member.organizationId },
    orderBy: { order: "asc" },
    select: { id: true },
  });

  let clientId: string | null = null;
  let caseId: string | null = null;
  let disputeItemId: string | null = null;

  try {
    const client = await clients.createClient(ctx, {
      firstName: MARK,
      lastName: "Scope",
      email: `rd-flags-${Date.now()}@example.com`,
    });
    clientId = client.id;

    const creditCase = await cases.createCreditCase(ctx, {
      clientId: client.id,
      stageId: stage.id,
      summary: `${MARK} smoke`,
    });
    caseId = creditCase.id;

    const report = await creditReports.createCreditReport(ctx, {
      caseId: creditCase.id,
      type: "INITIAL",
      reportDate: new Date("2026-01-15"),
      snapshots: [{ bureau: "EXPERIAN", score: 520 }],
      items: [
        {
          creditorName: "Flags Collect",
          accountNumberMasked: "****8899",
          bureau: "EXPERIAN",
          balance: 100,
          negativeType: "COLLECTION",
          isNegative: true,
        },
      ],
    });

    const detail = await creditReports.getReportDetail(ctx, report.id);
    const creditItem = detail.items.find((i) => i.creditorName === "Flags Collect");
    if (!creditItem) throw new Error("credit item missing");

    const round = await rounds.createRound(ctx, { caseId: creditCase.id });
    const created = await disputes.addDisputeItem(ctx, {
      roundId: round.id,
      creditItemId: creditItem.id,
      disputeReason: "No es mi cuenta",
      action: "Disputar",
    });
    disputeItemId = created.id;

    check(
      "default scope OUT_OF_SCOPE",
      created.scope === DEFAULT_DISPUTE_SCOPE,
      created.scope,
    );
    check("default method MAIL", created.method === "MAIL", created.method);

    const updated = await disputes.updateDisputeItem(ctx, created.id, {
      scope: "IN_SCOPE",
      method: "ONLINE",
    });
    check("update scope IN_SCOPE", updated.scope === "IN_SCOPE");
    check("update method ONLINE", updated.method === "ONLINE");

    const summary = await disputes.getRoundDisputeSummary(ctx, round.id);
    const row = summary.items.find((i) => i.id === created.id);
    check("summary incluye scope/method", Boolean(row?.scope && row?.method));
  } finally {
    if (disputeItemId) {
      await prisma.disputeItem.delete({ where: { id: disputeItemId } }).catch(() => {});
    }
    if (caseId) {
      await prisma.creditBureauSnapshot
        .deleteMany({
          where: { report: { caseId } },
        })
        .catch(() => {});
      await prisma.creditItem.deleteMany({ where: { caseId } }).catch(() => {});
      await prisma.creditReport.deleteMany({ where: { caseId } }).catch(() => {});
      await prisma.creditRound.deleteMany({ where: { caseId } }).catch(() => {});
      await prisma.creditCase.delete({ where: { id: caseId } }).catch(() => {});
      await prisma.serviceCase
        .deleteMany({ where: { creditCase: { id: caseId } } })
        .catch(() => {});
    }
    if (clientId) {
      await prisma.activityLog.deleteMany({ where: { clientId } }).catch(() => {});
      await prisma.client.delete({ where: { id: clientId } }).catch(() => {});
    }
  }

  console.log("\nOK dispute-scope-method\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
