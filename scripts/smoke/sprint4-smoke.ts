/**
 * Smoke SPRINT 4 — procesadores, oportunidades, atribución, intake payload.
 *
 *   npm run smoke:sprint4
 */
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";
import * as clients from "../../src/server/clients";
import * as processors from "../../src/server/processors";
import * as opportunities from "../../src/server/opportunities";
import * as attribution from "../../src/server/attribution";
import { intakePayloadSchema } from "../../src/lib/validation/intake-payload";
import {
  inferLeadChannel,
  normalizeAttribution,
} from "../../src/lib/attribution";

const prisma = new PrismaClient();
const MARK = "S4-SMOKE";
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

  let clientId: string | null = null;
  let processorId: string | null = null;
  let opportunityId: string | null = null;
  let wonCaseId: string | null = null;

  try {
    console.log("\n[0] Attribution helpers + intake payload zod");
    const attr = normalizeAttribution({
      utm_source: " facebook ",
      utm_campaign: "spring",
      fbclid: "abc",
      junk: "x",
    });
    check("normalize keeps utm + fbclid", Boolean(attr.utm_source === "facebook" && attr.fbclid));
    check("infer FACEBOOK from fbclid", inferLeadChannel(attr) === "FACEBOOK");
    check(
      "infer GOOGLE from gclid",
      inferLeadChannel(normalizeAttribution({ gclid: "1" })) === "GOOGLE",
    );
    const parsed = intakePayloadSchema.safeParse({
      primaryGoal: "HOME_PURCHASE",
      consultationReason: "Quiero mejorar mi crédito",
      hasCollection: true,
      hasChargeOff: false,
      hasLatePayments: true,
      hasRepossession: false,
      hasBankruptcy: false,
      hasHardInquiries: true,
      reportProvider: "SmartCredit",
      hasRecentReportAccess: true,
    });
    check("intake payload zod ok", parsed.success, parsed.success ? undefined : parsed.error);

    console.log("\n[1] Processor catalog + link account");
    const client = await clients.createClient(ctx, {
      firstName: `${MARK} Ana`,
      lastName: "Pipeline",
      email: `s4-smoke-${Date.now()}@example.com`,
      phone: "3125550199",
      addressLine1: "100 Main St",
      city: "Houston",
      state: "TX",
      postalCode: "77002",
    });
    clientId = client.id;

    const processor = await processors.createProcessor(ctx, {
      name: `${MARK} SmartCredit`,
      type: "CREDIT_MONITOR",
      monthlyPrice: 29.99,
      websiteUrl: "https://example.com/smartcredit",
    });
    processorId = processor.id;
    check("createProcessor", Boolean(processor.id));

    const listed = await processors.listProcessors(ctx, true);
    check(
      "listProcessors includes new",
      listed.some((p) => p.id === processor.id),
    );

    const account = await processors.linkAccount(ctx, {
      processorId: processor.id,
      clientId: client.id,
      externalMemberId: "EXT-123",
      status: "ACTIVE",
    });
    check("linkAccount", Boolean(account.id));

    const accounts = await processors.listAccountsForClient(ctx, client.id);
    check("listAccountsForClient", accounts.length >= 1);

    console.log("\n[2] Opportunity pipeline + markWon");
    const opp = await opportunities.createOpportunity(ctx, {
      clientId: client.id,
      estimatedValue: 1500,
      source: "smoke",
      campaign: "sprint4",
    });
    opportunityId = opp.id;
    check("createOpportunity NEW_LEAD", opp.stage === "NEW_LEAD");

    const contacted = await opportunities.updateStage(ctx, opp.id, "CONTACTED");
    check("updateStage CONTACTED", contacted.stage === "CONTACTED");

    const proposal = await opportunities.updateStage(ctx, opp.id, "PROPOSAL");
    check("updateStage PROPOSAL", proposal.stage === "PROPOSAL");

    const won = await opportunities.markWon(ctx, opp.id);
    wonCaseId = won.wonCaseId;
    check("markWon stage", won.stage === "WON");
    check("markWon wonCaseId", Boolean(won.wonCaseId));

    const refreshedClient = await prisma.client.findUniqueOrThrow({
      where: { id: client.id },
    });
    check("client ACTIVE after WON", refreshedClient.status === "ACTIVE");

    const creditCase = await prisma.creditCase.findFirst({
      where: { id: won.wonCaseId!, organizationId: org.id },
    });
    check("CreditCase created", Boolean(creditCase));

    console.log("\n[3] Attribution aggregates");
    await prisma.client.update({
      where: { id: client.id },
      data: {
        leadChannel: "FACEBOOK",
        attribution: {
          utm_source: "facebook",
          utm_campaign: `${MARK}-camp`,
        },
      },
    });
    const dash = await attribution.getAttributionDashboard(ctx);
    check(
      "leadsByChannel has rows",
      dash.byChannel.length > 0,
    );
    check(
      "leadsByCampaign includes smoke",
      dash.byCampaign.some((c) => c.campaign === `${MARK}-camp`),
    );
    check("conversionByChannel runs", Array.isArray(dash.conversion));
  } finally {
    console.log("\n[cleanup]");
    if (opportunityId) {
      await prisma.opportunity.deleteMany({ where: { id: opportunityId } }).catch(() => undefined);
    }
    if (wonCaseId) {
      await prisma.creditCase.deleteMany({ where: { id: wonCaseId } }).catch(() => undefined);
    }
    if (clientId) {
      await prisma.clientProcessorAccount.deleteMany({ where: { clientId } }).catch(() => undefined);
      await prisma.activityLog.deleteMany({ where: { clientId } }).catch(() => undefined);
      await prisma.client.deleteMany({ where: { id: clientId } }).catch(() => undefined);
    }
    if (processorId) {
      await prisma.creditProcessor.deleteMany({ where: { id: processorId } }).catch(() => undefined);
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
