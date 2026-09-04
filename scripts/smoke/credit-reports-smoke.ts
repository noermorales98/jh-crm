/**
 * Smoke test SPRINT 1 — reportes de crédito estructurados.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/smoke/credit-reports-smoke.ts
 *
 * Crea cliente → caso → reportes INITIAL/UPDATE con scores → ítems →
 * overview (deltas) → aislamiento de tenant → limpia.
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as cases from "../../src/server/cases";
import * as creditReports from "../../src/server/credit-reports";

const prisma = new PrismaClient();
const MARK = "CR-SMOKE";
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

  const otherOrg = await prisma.organization.findFirst({
    where: { id: { not: org.id } },
  });

  console.log(`Organización: ${org.name} (${org.id})`);

  const stageAnalysis = await prisma.workflowStage.findFirstOrThrow({
    where: { organizationId: org.id, key: "ANALYSIS" },
  });

  let clientId: string | null = null;
  let caseId: string | null = null;

  try {
    console.log("\n[1] Cliente + caso");
    const client = await clients.createClient(ctx, {
      firstName: `${MARK} María`,
      lastName: "Crédito",
      email: "cr.smoke@example.com",
    });
    clientId = client.id;

    const creditCase = await cases.createCreditCase(ctx, {
      clientId: client.id,
      stageId: stageAnalysis.id,
      summary: `${MARK} caso credit reports`,
    });
    caseId = creditCase.id;
    check("caso creado", Boolean(creditCase.id));

    console.log("\n[2] Reporte inicial + scores");
    const initial = await creditReports.createCreditReport(ctx, {
      caseId: creditCase.id,
      type: "INITIAL",
      reportDate: new Date("2026-01-15"),
      provider: "SmartCredit",
      snapshots: [
        { bureau: "EXPERIAN", score: 548 },
        { bureau: "EQUIFAX", score: 561 },
        { bureau: "TRANSUNION", score: 557 },
      ],
      items: [
        {
          creditorName: "ABC Collections",
          accountNumberMasked: "****4412",
          bureau: "EXPERIAN",
          balance: 1200,
          negativeType: "COLLECTION",
          isNegative: true,
        },
        {
          creditorName: "XYZ Bank",
          accountNumberMasked: "****9981",
          bureau: "EQUIFAX",
          balance: 450,
          negativeType: "CHARGE_OFF",
          isNegative: true,
        },
      ],
    });
    check("reporte INITIAL creado", Boolean(initial.id));
    check("3 snapshots", initial.snapshots.length === 3, initial.snapshots.length);

    console.log("\n[3] Reporte UPDATE + overview");
    const update = await creditReports.createCreditReport(ctx, {
      caseId: creditCase.id,
      type: "UPDATE",
      reportDate: new Date("2026-03-20"),
      provider: "SmartCredit",
      snapshots: [
        { bureau: "EXPERIAN", score: 584 },
        { bureau: "EQUIFAX", score: 590 },
        { bureau: "TRANSUNION", score: 576 },
      ],
    });
    check("reporte UPDATE creado", Boolean(update.id));

    const overview = await creditReports.getCaseCreditOverview(ctx, creditCase.id);
    check("historial con 2 filas", overview.history.length === 2, overview.history.length);
    check(
      "score actual Experian 584",
      overview.current.find((c) => c.bureau === "EXPERIAN")?.score === 584,
    );
    check(
      "delta Experian +36",
      overview.current.find((c) => c.bureau === "EXPERIAN")?.delta === 36,
    );
    check("elementos negativos = 2", overview.negativeItemCount === 2);

    console.log("\n[4] Ítems CRUD");
    const added = await creditReports.addCreditItem(ctx, update.id, {
      creditorName: "Late Pay Co",
      bureau: "TRANSUNION",
      accountNumberMasked: "****2200",
      negativeType: "LATE_PAYMENT",
      isNegative: true,
    });
    check("ítem añadido", Boolean(added.id));

    await creditReports.updateCreditItem(ctx, added.id, {
      lifecycleStatus: "UNDER_REVIEW",
      balance: 89.5,
    });
    const detail = await creditReports.getReportDetail(ctx, update.id);
    const found = detail.items.find((i) => i.id === added.id);
    check("lifecycle UNDER_REVIEW", found?.lifecycleStatus === "UNDER_REVIEW");
    check("balance actualizado", found?.balance?.toString() === "89.5");

    await creditReports.deleteCreditItem(ctx, added.id);
    const afterDelete = await creditReports.getReportDetail(ctx, update.id);
    check("ítem eliminado", !afterDelete.items.some((i) => i.id === added.id));

    console.log("\n[5] Tenant isolation");
    if (otherOrg) {
      const foreignCtx: OrganizationContext = {
        userId: ownerMembership.userId,
        organizationId: otherOrg.id,
        role: "OWNER",
      };
      const visible = await creditReports.assertReportTenantIsolation(
        foreignCtx,
        initial.id,
      );
      check("otra org no ve el reporte", visible === false);
    } else {
      const visible = await creditReports.assertReportTenantIsolation(ctx, initial.id);
      check("misma org sí ve el reporte", visible === true);
      console.log("  (sin segunda org; skip cross-tenant)");
    }

    const activity = await prisma.activityLog.count({
      where: {
        organizationId: org.id,
        caseId: creditCase.id,
        type: { in: ["CREDIT_REPORT_CREATED", "CREDIT_REPORT_UPDATED"] },
      },
    });
    check("activity logs de crédito > 0", activity > 0, activity);
  } finally {
    console.log("\n[cleanup]");
    if (caseId) {
      await prisma.creditItem.deleteMany({ where: { caseId } });
      await prisma.creditReport.deleteMany({ where: { caseId } });
      await prisma.activityLog.deleteMany({
        where: { caseId, type: { in: ["CREDIT_REPORT_CREATED", "CREDIT_REPORT_UPDATED"] } },
      });
      await prisma.creditCase.delete({ where: { id: caseId } }).catch(() => undefined);
    }
    if (clientId) {
      await prisma.activityLog.deleteMany({ where: { clientId } });
      await prisma.clientSensitiveProfile.deleteMany({ where: { clientId } }).catch(() => undefined);
      await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
    }
    console.log("  datos de prueba eliminados");
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
