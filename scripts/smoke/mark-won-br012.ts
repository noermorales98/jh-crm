/**
 * Smoke LD-005 / BR-012: markWon atómico.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/mark-won-br012.ts
 */
import { PrismaClient } from "@prisma/client";
import * as opportunities from "../../src/server/opportunities";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `won-br012-${Date.now()}`;

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  let clientId: string | null = null;
  let opportunityId: string | null = null;
  let wonCaseId: string | null = null;
  let wonServiceCaseId: string | null = null;

  try {
    const member = await prisma.organizationMember.findFirst({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    if (!member) throw new Error("No hay OWNER en la org.");

    const ctx: OrganizationContext = {
      userId: member.userId,
      organizationId: member.organizationId,
      role: member.role,
    };

    console.log("\n[LD-005] createLead + markWon (BR-012)");

    const created = await opportunities.createLead(ctx, {
      firstName: "Smoke",
      lastName: MARK,
      email: `${MARK}@example.test`,
      phone: null,
      source: "instagram_smoke",
      leadChannel: "INSTAGRAM",
      serviceRequested: "CREDIT_REPAIR",
      ownerId: member.userId,
      estimatedValue: 999,
      campaign: MARK,
      nextFollowUpAt: new Date(Date.now() + 86400000),
    });

    clientId = created.client.id;
    opportunityId = created.opportunity.id;

    check("client LEAD", created.client.status === "LEAD");
    check("source set", created.client.source === "instagram_smoke");
    check("opp open", created.opportunity.stage === "NEW_LEAD");

    const clientsBefore = await prisma.client.count({
      where: { organizationId: ctx.organizationId, lastName: MARK },
    });
    check("one client before WON", clientsBefore === 1);

    const won = await opportunities.markWon(ctx, created.opportunity.id);
    opportunityId = won.id;
    wonCaseId = won.wonCaseId;
    wonServiceCaseId = won.wonServiceCaseId;

    check("stage WON", won.stage === "WON");
    check("wonCaseId set", Boolean(won.wonCaseId));
    check("wonServiceCaseId set", Boolean(won.wonServiceCaseId));
    check("nextFollowUp cleared", won.nextFollowUpAt == null);

    const clientAfter = await prisma.client.findUniqueOrThrow({
      where: { id: created.client.id },
    });
    check("client ACTIVE", clientAfter.status === "ACTIVE");
    check("source preserved", clientAfter.source === "instagram_smoke");
    check("leadChannel preserved", clientAfter.leadChannel === "INSTAGRAM");

    const clientsAfter = await prisma.client.count({
      where: { organizationId: ctx.organizationId, lastName: MARK },
    });
    check("no duplicate client", clientsAfter === 1);

    const creditCase = await prisma.creditCase.findUniqueOrThrow({
      where: { id: won.wonCaseId! },
    });
    check("CreditCase exists", Boolean(creditCase.id));
    check(
      "CreditCase.serviceCaseId == wonServiceCaseId",
      creditCase.serviceCaseId === won.wonServiceCaseId,
    );

    const serviceCase = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: won.wonServiceCaseId! },
    });
    check("ServiceCase OPEN", serviceCase.status === "OPEN");
    check("ServiceCase same client", serviceCase.clientId === created.client.id);
    check(
      "caseNumber == caseCode",
      serviceCase.caseNumber === creditCase.caseCode,
    );

    const oppStill = await prisma.opportunity.findUniqueOrThrow({
      where: { id: won.id },
    });
    check("Opportunity not deleted", Boolean(oppStill.id));

    const activity = await prisma.activityLog.findFirst({
      where: {
        organizationId: ctx.organizationId,
        clientId: created.client.id,
        type: "OPPORTUNITY_WON",
      },
      orderBy: { createdAt: "desc" },
    });
    check("Activity OPPORTUNITY_WON", Boolean(activity));

    let rejected = false;
    try {
      await opportunities.markWon(ctx, won.id);
    } catch {
      rejected = true;
    }
    check("idempotent reject second WON", rejected);

    console.log(
      JSON.stringify(
        {
          ok: true,
          opportunityId: won.id,
          wonCaseId,
          wonServiceCaseId,
          caseCode: creditCase.caseCode,
        },
        null,
        2,
      ),
    );
  } finally {
    console.log("\n[cleanup]");
    if (opportunityId) {
      await prisma.opportunity
        .deleteMany({ where: { id: opportunityId } })
        .catch(() => undefined);
    }
    if (wonCaseId) {
      await prisma.creditCase
        .deleteMany({ where: { id: wonCaseId } })
        .catch(() => undefined);
    }
    if (wonServiceCaseId) {
      await prisma.serviceCase
        .deleteMany({ where: { id: wonServiceCaseId } })
        .catch(() => undefined);
    }
    if (clientId) {
      await prisma.activityLog
        .deleteMany({ where: { clientId } })
        .catch(() => undefined);
      await prisma.note.deleteMany({ where: { clientId } }).catch(() => undefined);
      await prisma.client.deleteMany({ where: { id: clientId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
