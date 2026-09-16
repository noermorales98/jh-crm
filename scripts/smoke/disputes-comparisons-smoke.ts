/**
 * Smoke SPRINT 2 — DisputeItem + comparación de reportes.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/smoke/disputes-comparisons-smoke.ts
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as rounds from "../../src/server/rounds";
import * as creditReports from "../../src/server/credit-reports";
import * as disputes from "../../src/server/disputes";
import * as comparisons from "../../src/server/comparisons";
import {
  classifyPair,
  computeComparisonItems,
} from "../../src/server/comparisons";

const prisma = new PrismaClient();
const MARK = "DC-SMOKE";
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
  const ownerMembership = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: "OWNER" },
  });
  const ctx: OrganizationContext = {
    userId: ownerMembership.userId,
    organizationId: org.id,
    role: "OWNER",
  };

  console.log(`Organización: ${org.name}`);

  const stage = await prisma.workflowStage.findFirstOrThrow({
    where: { organizationId: org.id, key: "ANALYSIS" },
  });

  let clientId: string | null = null;
  let caseId: string | null = null;

  try {
    console.log("\n[0] Algoritmo puro");
    check(
      "solo base → DELETED",
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
    check(
      "solo compare → NEW",
      classifyPair(undefined, {
        id: "2",
        creditorName: "B",
        accountNumberMasked: "****2",
        bureau: "EQUIFAX",
        balance: null,
        accountStatus: null,
        paymentStatus: null,
        remarks: null,
      }) === "NEW",
    );

    const pure = computeComparisonItems(
      [
        {
          id: "b1",
          creditorName: "Same Co",
          accountNumberMasked: "****1111",
          bureau: "EXPERIAN",
          balance: null,
          accountStatus: "Open",
          paymentStatus: "OK",
          remarks: null,
        },
        {
          id: "b2",
          creditorName: "Changed Co",
          accountNumberMasked: "****2222",
          bureau: "EQUIFAX",
          balance: null,
          accountStatus: "Open",
          paymentStatus: "30 late",
          remarks: "x",
        },
        {
          id: "b3",
          creditorName: "Gone Co",
          accountNumberMasked: "****3333",
          bureau: "TRANSUNION",
          balance: null,
          accountStatus: null,
          paymentStatus: null,
          remarks: null,
        },
      ],
      [
        {
          id: "c1",
          creditorName: "Same Co",
          accountNumberMasked: "****1111",
          bureau: "EXPERIAN",
          balance: null,
          accountStatus: "Open",
          paymentStatus: "OK",
          remarks: null,
        },
        {
          id: "c2",
          creditorName: "Changed Co",
          accountNumberMasked: "****2222",
          bureau: "EQUIFAX",
          balance: null,
          accountStatus: "Closed",
          paymentStatus: "Current",
          remarks: "y",
        },
        {
          id: "c4",
          creditorName: "Brand New",
          accountNumberMasked: "****4444",
          bureau: "EXPERIAN",
          balance: null,
          accountStatus: null,
          paymentStatus: null,
          remarks: null,
        },
      ],
    );
    check(
      "compute UNCHANGED",
      pure.some((r) => r.creditorName === "Same Co" && r.autoResult === "UNCHANGED"),
    );
    check(
      "compute UPDATED",
      pure.some((r) => r.creditorName === "Changed Co" && r.autoResult === "UPDATED"),
    );
    check(
      "compute DELETED",
      pure.some((r) => r.creditorName === "Gone Co" && r.autoResult === "DELETED"),
    );
    check(
      "compute NEW",
      pure.some((r) => r.creditorName === "Brand New" && r.autoResult === "NEW"),
    );

    console.log("\n[1] Caso + reportes");
    const client = await clients.createClient(ctx, {
      firstName: `${MARK} Luis`,
      lastName: "Disputa",
    });
    clientId = client.id;
    const creditCase = await cases.createCreditCase(ctx, {
      clientId: client.id,
      stageId: stage.id,
    });
    caseId = creditCase.id;

    const initial = await creditReports.createCreditReport(ctx, {
      caseId: creditCase.id,
      type: "INITIAL",
      reportDate: new Date("2026-01-10"),
      snapshots: [
        { bureau: "EXPERIAN", score: 500 },
        { bureau: "EQUIFAX", score: 510 },
        { bureau: "TRANSUNION", score: 505 },
      ],
      items: [
        {
          creditorName: "ABC Collect",
          accountNumberMasked: "****1001",
          bureau: "EXPERIAN",
          balance: 900,
          negativeType: "COLLECTION",
          isNegative: true,
        },
        {
          creditorName: "Bank Late",
          accountNumberMasked: "****2002",
          bureau: "EQUIFAX",
          balance: 200,
          accountStatus: "Open",
          paymentStatus: "60 late",
          negativeType: "LATE_PAYMENT",
          isNegative: true,
        },
      ],
    });

    const update = await creditReports.createCreditReport(ctx, {
      caseId: creditCase.id,
      type: "UPDATE",
      reportDate: new Date("2026-04-10"),
      snapshots: [
        { bureau: "EXPERIAN", score: 540 },
        { bureau: "EQUIFAX", score: 530 },
        { bureau: "TRANSUNION", score: 520 },
      ],
      items: [
        {
          creditorName: "Bank Late",
          accountNumberMasked: "****2002",
          bureau: "EQUIFAX",
          balance: 150,
          accountStatus: "Open",
          paymentStatus: "Current",
          isNegative: false,
        },
        {
          creditorName: "New Inquiry Co",
          accountNumberMasked: "****3003",
          bureau: "TRANSUNION",
          negativeType: "HARD_INQUIRY",
          isNegative: true,
        },
      ],
    });
    check("reportes creados", Boolean(initial.id && update.id));

    console.log("\n[2] Ronda + DisputeItems");
    const round = await rounds.createRound(ctx, { caseId: creditCase.id });
    const initialDetail = await creditReports.getReportDetail(ctx, initial.id);
    const itemA = initialDetail.items.find((i) => i.creditorName === "ABC Collect")!;
    const itemB = initialDetail.items.find((i) => i.creditorName === "Bank Late")!;

    const dItemA = await disputes.addDisputeItem(ctx, {
      roundId: round.id,
      creditItemId: itemA.id,
      disputeReason: "No es mi cuenta",
      action: "Eliminar",
    });
    const dItemB = await disputes.addDisputeItem(ctx, {
      roundId: round.id,
      creditItemId: itemB.id,
      disputeReason: "Información inexacta",
      action: "Disputar",
    });
    check("dispute A action", dItemA.action === "Eliminar");
    check("dispute B action", dItemB.action === "Disputar");

    const roundAfter = await prisma.creditRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    check("disputedItemsCount = 2", roundAfter.disputedItemsCount === 2);

    const disputeList = await disputes.getRoundDisputeSummary(ctx, round.id);
    const dA = disputeList.items.find(
      (i) => i.creditItem.creditorName === "ABC Collect",
    )!;
    await disputes.updateDisputeItem(ctx, dA.id, {
      outcome: "DELETED",
      status: "COMPLETED",
    });
    const dB = disputeList.items.find(
      (i) => i.creditItem.creditorName === "Bank Late",
    )!;
    await disputes.updateDisputeItem(ctx, dB.id, {
      outcome: "UPDATED",
      status: "COMPLETED",
    });

    const summary = await disputes.getRoundDisputeSummary(ctx, round.id);
    check("summary deleted=1", summary.byOutcome.deleted === 1);
    check("summary updated=1", summary.byOutcome.updated === 1);
    check("summary total=2", summary.total === 2);

    console.log("\n[3] Comparación");
    const cmp = await comparisons.createComparison(ctx, {
      caseId: creditCase.id,
      baseReportId: initial.id,
      compareReportId: update.id,
    });
    check("comparación creada", Boolean(cmp.id));
    check("summary tiene DELETED", cmp.summary.deleted >= 1, cmp.summary);
    check("summary tiene UPDATED o NEW", cmp.summary.updated + cmp.summary.new >= 1);

    const experianDelta = cmp.scoreDeltas.find((s) => s.bureau === "EXPERIAN");
    check("delta Experian +40", experianDelta?.delta === 40, experianDelta);

    const firstItem = cmp.items[0];
    const overridden = await comparisons.overrideComparisonItem(ctx, firstItem.id, {
      manualResult: "VERIFIED",
      notes: "Corrección manual smoke",
    });
    const ov = overridden.items.find((i) => i.id === firstItem.id);
    check("override VERIFIED", ov?.effectiveResult === "VERIFIED");
    check("manualResult set", ov?.manualResult === "VERIFIED");

    console.log("\n[4] Tenant isolation");
    const otherOrg = await prisma.organization.findFirst({
      where: { id: { not: org.id } },
    });
    if (otherOrg) {
      const foreign: OrganizationContext = {
        userId: ownerMembership.userId,
        organizationId: otherOrg.id,
        role: "OWNER",
      };
      let blocked = false;
      try {
        await comparisons.getComparison(foreign, cmp.id);
      } catch {
        blocked = true;
      }
      check("otra org no ve comparación", blocked);
    } else {
      check("misma org ve comparación", Boolean(await comparisons.getComparison(ctx, cmp.id)));
      console.log("  (sin segunda org)");
    }
  } finally {
    console.log("\n[cleanup]");
    if (caseId) {
      await prisma.reportComparisonItem.deleteMany({
        where: { comparison: { caseId } },
      });
      await prisma.reportComparison.deleteMany({ where: { caseId } });
      await prisma.disputeItem.deleteMany({
        where: { round: { caseId } },
      });
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
      await prisma.clientSensitiveProfile
        .deleteMany({ where: { clientId } })
        .catch(() => undefined);
      await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
    }
  }

  console.log(`\nResultado: ${passed} ok, ${failed} fallos`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
