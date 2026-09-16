/**
 * Seed DEMO persistente para probar Crédito / Rondas / Comparaciones.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/seed-demo-credit-case.ts
 *
 * No limpia al final. Si ya existe el cliente DEMO, lo reutiliza / actualiza.
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../src/server/auth/guards";
import * as clients from "../src/server/clients";
import * as cases from "../src/server/cases";
import * as rounds from "../src/server/rounds";
import * as creditReports from "../src/server/credit-reports";
import * as disputes from "../src/server/disputes";
import * as comparisons from "../src/server/comparisons";

const prisma = new PrismaClient();
const DEMO_EMAIL = "demo.credito@jh-multiservices.local";
const DEMO_FIRST = "María";
const DEMO_LAST = "González Demo";

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

  await prisma.organizationSettings.update({
    where: { organizationId: org.id },
    data: {
      legalName: "J&H Multiservices LLC",
      phone: "+1 (832) 555-0142",
      email: "info@jhmultiservices.com",
      website: "https://jhmultiservices.com",
      addressLine1: "1234 Business Park Dr",
      city: "Houston",
      state: "TX",
      postalCode: "77036",
      country: "US",
    },
  });

  const stage = await prisma.workflowStage.findFirstOrThrow({
    where: { organizationId: org.id, key: "ANALYSIS" },
  });

  let client = await prisma.client.findFirst({
    where: { organizationId: org.id, email: DEMO_EMAIL },
  });

  if (client) {
    console.log(`Cliente DEMO existente: ${client.clientCode} (${client.id})`);
    // Limpiar caso DEMO previo para datos frescos
    const oldCases = await prisma.creditCase.findMany({
      where: {
        organizationId: org.id,
        clientId: client.id,
        summary: { contains: "DEMO SPRINT" },
      },
      select: { id: true },
    });
    for (const c of oldCases) {
      await prisma.reportComparisonItem.deleteMany({
        where: { comparison: { caseId: c.id } },
      });
      await prisma.reportComparison.deleteMany({ where: { caseId: c.id } });
      await prisma.disputeItem.deleteMany({ where: { round: { caseId: c.id } } });
      await prisma.creditItem.deleteMany({ where: { caseId: c.id } });
      await prisma.creditBureauSnapshot.deleteMany({
        where: { report: { caseId: c.id } },
      });
      await prisma.creditReport.deleteMany({ where: { caseId: c.id } });
      await prisma.activityLog.deleteMany({ where: { caseId: c.id } });
      await prisma.task.deleteMany({ where: { caseId: c.id } });
      await prisma.creditRound.deleteMany({ where: { caseId: c.id } });
      await prisma.creditCase.delete({ where: { id: c.id } });
    }
    client = await clients.updateClient(ctx, client.id, {
      firstName: DEMO_FIRST,
      lastName: DEMO_LAST,
      phone: "+1 (713) 555-0198",
      addressLine1: "8901 Westheimer Rd",
      addressLine2: "Apt 204",
      city: "Houston",
      state: "TX",
      postalCode: "77063",
      status: "ACTIVE",
    });
  } else {
    client = await clients.createClient(ctx, {
      firstName: DEMO_FIRST,
      lastName: DEMO_LAST,
      email: DEMO_EMAIL,
      phone: "+1 (713) 555-0198",
      addressLine1: "8901 Westheimer Rd",
      addressLine2: "Apt 204",
      city: "Houston",
      state: "TX",
      postalCode: "77063",
      source: "DEMO",
      status: "ACTIVE",
    });
    console.log(`Cliente DEMO creado: ${client.clientCode}`);
  }

  await clients.updateSensitiveProfile(ctx, client.id, {
    ssn: "123-45-6789",
    dateOfBirth: new Date("1988-03-22"),
  });

  const creditCase = await cases.createCreditCase(ctx, {
    clientId: client.id,
    stageId: stage.id,
    summary:
      "DEMO SPRINT — caso completo: reportes, disputas, comparación. Listo para cartas.",
    assignedToId: owner.userId,
  });

  const report1 = await creditReports.createCreditReport(ctx, {
    caseId: creditCase.id,
    type: "INITIAL",
    reportDate: new Date("2026-01-15"),
    provider: "SmartCredit",
    notes: "Reporte inicial al abrir el expediente.",
    snapshots: [
      { bureau: "EXPERIAN", score: 548, negativeAccounts: 4, collections: 2 },
      { bureau: "EQUIFAX", score: 561, negativeAccounts: 3, collections: 1 },
      { bureau: "TRANSUNION", score: 557, negativeAccounts: 4, collections: 2 },
    ],
    items: [
      {
        creditorName: "ABC Collections",
        accountNumberMasked: "****4412",
        bureau: "EXPERIAN",
        balance: 1840,
        accountStatus: "Open",
        paymentStatus: "Collection",
        negativeType: "COLLECTION",
        isNegative: true,
        remarks: "Assigned to collection agency",
      },
      {
        creditorName: "Capital One",
        accountNumberMasked: "****8821",
        bureau: "EQUIFAX",
        balance: 620,
        creditLimit: 1500,
        accountStatus: "Open",
        paymentStatus: "Charge-off",
        negativeType: "CHARGE_OFF",
        isNegative: true,
      },
      {
        creditorName: "Ally Auto",
        accountNumberMasked: "****3301",
        bureau: "TRANSUNION",
        balance: 0,
        accountStatus: "Closed",
        paymentStatus: "Repossession",
        negativeType: "REPOSSESSION",
        isNegative: true,
      },
      {
        creditorName: "Hard Pull Bank",
        accountNumberMasked: "****INQ1",
        bureau: "EXPERIAN",
        negativeType: "HARD_INQUIRY",
        isNegative: true,
        disputeEligible: true,
      },
    ],
  });

  const report2 = await creditReports.createCreditReport(ctx, {
    caseId: creditCase.id,
    type: "UPDATE",
    reportDate: new Date("2026-03-20"),
    provider: "SmartCredit",
    notes: "Tras ronda 1.",
    snapshots: [
      { bureau: "EXPERIAN", score: 584, negativeAccounts: 2 },
      { bureau: "EQUIFAX", score: 590, negativeAccounts: 2 },
      { bureau: "TRANSUNION", score: 576, negativeAccounts: 3 },
    ],
    items: [
      {
        creditorName: "Capital One",
        accountNumberMasked: "****8821",
        bureau: "EQUIFAX",
        balance: 410,
        creditLimit: 1500,
        accountStatus: "Open",
        paymentStatus: "Updated",
        negativeType: "CHARGE_OFF",
        isNegative: true,
      },
      {
        creditorName: "Ally Auto",
        accountNumberMasked: "****3301",
        bureau: "TRANSUNION",
        balance: 0,
        accountStatus: "Closed",
        paymentStatus: "Verified",
        negativeType: "REPOSSESSION",
        isNegative: true,
      },
      {
        creditorName: "New Late Pay Co",
        accountNumberMasked: "****5500",
        bureau: "EXPERIAN",
        balance: 89,
        negativeType: "LATE_PAYMENT",
        isNegative: true,
      },
    ],
  });

  const report3 = await creditReports.createCreditReport(ctx, {
    caseId: creditCase.id,
    type: "UPDATE",
    reportDate: new Date("2026-05-18"),
    provider: "SmartCredit",
    notes: "Seguimiento ronda 2 (preparación).",
    snapshots: [
      { bureau: "EXPERIAN", score: 612 },
      { bureau: "EQUIFAX", score: 620 },
      { bureau: "TRANSUNION", score: 605 },
    ],
    items: [
      {
        creditorName: "Capital One",
        accountNumberMasked: "****8821",
        bureau: "EQUIFAX",
        balance: 200,
        accountStatus: "Open",
        paymentStatus: "Current",
        isNegative: false,
      },
      {
        creditorName: "New Late Pay Co",
        accountNumberMasked: "****5500",
        bureau: "EXPERIAN",
        balance: 45,
        negativeType: "LATE_PAYMENT",
        isNegative: true,
      },
    ],
  });

  const detail1 = await creditReports.getReportDetail(ctx, report1.id);
  const round = await rounds.createRound(ctx, {
    caseId: creditCase.id,
    notes: "Ronda 1 DEMO — colección, charge-off, reposesión e inquiry.",
    lettersCount: 0,
  });

  for (const item of detail1.items) {
    await disputes.addDisputeItem(ctx, {
      roundId: round.id,
      creditItemId: item.id,
      disputeReason:
        item.negativeType === "HARD_INQUIRY"
          ? "Consulta no autorizada"
          : "Información inexacta / no reconocida",
      action: item.negativeType === "HARD_INQUIRY" ? "Eliminar" : "Disputar",
      disputeDetails: "Cliente solicita investigación conforme a FCRA.",
    });
  }

  const summary = await disputes.getRoundDisputeSummary(ctx, round.id);
  const byName = Object.fromEntries(
    summary.items.map((i) => [i.creditItem.creditorName, i.id]),
  );
  await disputes.updateDisputeItem(ctx, byName["ABC Collections"], {
    outcome: "DELETED",
    status: "COMPLETED",
  });
  await disputes.updateDisputeItem(ctx, byName["Capital One"], {
    outcome: "UPDATED",
    status: "COMPLETED",
  });
  await disputes.updateDisputeItem(ctx, byName["Ally Auto"], {
    outcome: "VERIFIED",
    status: "COMPLETED",
  });
  await disputes.updateDisputeItem(ctx, byName["Hard Pull Bank"], {
    outcome: "NOT_RESPONDED",
    status: "WAITING",
  });

  await rounds.markRoundSent(ctx, round.id, {
    expectedReviewAt: new Date("2026-03-15"),
    createReviewTask: true,
  });
  await rounds.markRoundReviewed(ctx, round.id, { outcome: "COMPLETED" });

  const comparison = await comparisons.createComparison(ctx, {
    caseId: creditCase.id,
    baseReportId: report1.id,
    compareReportId: report2.id,
    notes: "Comparación DEMO inicio vs ronda 1",
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  console.log("\n=== DEMO LISTO ===");
  console.log(`Cliente:  ${client.clientCode} — ${DEMO_FIRST} ${DEMO_LAST}`);
  console.log(`Cliente ID: ${client.id}`);
  console.log(`Caso:     ${creditCase.caseCode} (${creditCase.id})`);
  console.log(`Ronda:    #${round.roundNumber} (${round.id})`);
  console.log(`Reportes: ${report1.id} | ${report2.id} | ${report3.id}`);
  console.log(`Comparación: ${comparison.id}`);
  console.log("\nURLs:");
  console.log(`  ${baseUrl}/crm/clientes/${client.id}`);
  console.log(`  ${baseUrl}/crm/casos/${creditCase.id}`);
  console.log(`  ${baseUrl}/crm/casos/${creditCase.id}/credito`);
  console.log(`  ${baseUrl}/crm/casos/${creditCase.id}/rondas/${round.id}`);
  console.log(
    `  ${baseUrl}/crm/casos/${creditCase.id}/comparaciones/${comparison.id}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
