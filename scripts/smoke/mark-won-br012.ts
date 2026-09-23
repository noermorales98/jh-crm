/**
 * Smoke LD-005 / BR-012: markWon atómico.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/mark-won-br012.ts
 */
import { PrismaClient } from "@prisma/client";
import * as opportunities from "../../src/server/opportunities";
import { ensureVerticalService } from "../../src/server/services/verticals";
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
  let rollbackClientId: string | null = null;
  let rollbackOpportunityId: string | null = null;
  let restoreStageIds: string[] = [];

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
    wonServiceCaseId = won.wonServiceCaseId;

    check("stage WON", won.stage === "WON");
    check("wonServiceCaseId set", Boolean(won.wonServiceCaseId));
    // Fase 4 / D5: wonServiceCaseId es el único enlace WON nuevo.
    check("wonCaseId ya no se escribe", won.wonCaseId == null);
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

    const serviceCase = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: won.wonServiceCaseId! },
      include: { creditCase: true },
    });
    const creditCase = serviceCase.creditCase;
    wonCaseId = creditCase?.id ?? null;
    check("CreditCase exists (1:1 vía ServiceCase)", Boolean(creditCase));
    check(
      "CreditCase.serviceCaseId == wonServiceCaseId",
      creditCase?.serviceCaseId === won.wonServiceCaseId,
    );
    check(
      "include expone creditCase vía wonServiceCase",
      won.wonServiceCase?.creditCase?.id === creditCase?.id,
    );

    check("ServiceCase OPEN", serviceCase.status === "OPEN");
    check("ServiceCase same client", serviceCase.clientId === created.client.id);
    check(
      "caseNumber == caseCode",
      serviceCase.caseNumber === creditCase?.caseCode,
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

    console.log("\n[LD-005] markWon rollback dentro de la transacción");
    const rollback = await opportunities.createLead(ctx, {
      firstName: "Smoke",
      lastName: `${MARK}-rollback`,
      email: `${MARK}-rollback@example.test`,
      phone: null,
      source: "instagram_smoke",
      leadChannel: "INSTAGRAM",
      serviceRequested: "HOME_BUYER",
      ownerId: member.userId,
      estimatedValue: 100,
      campaign: `${MARK}-rollback`,
    });
    rollbackClientId = rollback.client.id;
    rollbackOpportunityId = rollback.opportunity.id;
    check("rollback client LEAD", rollback.client.status === "LEAD");
    check("rollback opp NEW_LEAD", rollback.opportunity.stage === "NEW_LEAD");

    // ensure* corre ANTES de la tx y crea el servicio si falta, así que
    // "servicio inexistente" no falla dentro de markWon. Se apagan las
    // etapas activas para que createServiceCase lance dentro de la tx.
    const homeBuyer = await ensureVerticalService(
      ctx.organizationId,
      "HOME_BUYER",
    );
    const stages = await prisma.workflowStage.findMany({
      where: { organizationId: ctx.organizationId, serviceId: homeBuyer.id },
      select: { id: true, isActive: true },
    });
    if (stages.length === 0) {
      throw new Error("HOME_BUYER no tiene etapas para provocar el fallo.");
    }
    restoreStageIds = stages.filter((stage) => stage.isActive).map((stage) => stage.id);
    await prisma.workflowStage.updateMany({
      where: { id: { in: stages.map((stage) => stage.id) } },
      data: { isActive: false },
    });

    let rolledBack = false;
    let rollbackMessage = "";
    try {
      await opportunities.markWon(ctx, rollback.opportunity.id, {
        serviceCode: "HOME_BUYER",
      });
    } catch (error) {
      rolledBack = true;
      rollbackMessage = error instanceof Error ? error.message : "";
    }
    check("markWon lanza dentro de la tx", rolledBack);
    check(
      "fallo de etapas activas",
      rollbackMessage.includes("etapas activas"),
    );

    const clientStill = await prisma.client.findUniqueOrThrow({
      where: { id: rollback.client.id },
    });
    const oppStillOpen = await prisma.opportunity.findUniqueOrThrow({
      where: { id: rollback.opportunity.id },
    });
    const serviceCases = await prisma.serviceCase.count({
      where: { clientId: rollback.client.id },
    });
    const creditCases = await prisma.creditCase.count({
      where: { clientId: rollback.client.id },
    });
    check("cliente sigue en LEAD", clientStill.status === "LEAD");
    check("oportunidad sigue en NEW_LEAD", oppStillOpen.stage === "NEW_LEAD");
    check("wonServiceCaseId null", oppStillOpen.wonServiceCaseId == null);
    check("sin ServiceCase", serviceCases === 0);
    check("sin CreditCase", creditCases === 0);

    console.log(
      JSON.stringify(
        {
          ok: true,
          opportunityId: won.id,
          wonCaseId,
          wonServiceCaseId,
          caseCode: creditCase?.caseCode ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    console.log("\n[cleanup]");
    if (restoreStageIds.length > 0) {
      await prisma.workflowStage
        .updateMany({
          where: { id: { in: restoreStageIds } },
          data: { isActive: true },
        })
        .catch(() => undefined);
    }
    if (rollbackOpportunityId) {
      await prisma.opportunity
        .deleteMany({ where: { id: rollbackOpportunityId } })
        .catch(() => undefined);
    }
    if (rollbackClientId) {
      const leaked = await prisma.serviceCase
        .findMany({
          where: { clientId: rollbackClientId },
          select: { id: true },
        })
        .catch(() => []);
      for (const row of leaked) {
        await prisma.creditCase
          .deleteMany({ where: { serviceCaseId: row.id } })
          .catch(() => undefined);
        await prisma.serviceCase
          .deleteMany({ where: { id: row.id } })
          .catch(() => undefined);
      }
      await prisma.activityLog
        .deleteMany({ where: { clientId: rollbackClientId } })
        .catch(() => undefined);
      await prisma.client
        .deleteMany({ where: { id: rollbackClientId } })
        .catch(() => undefined);
    }
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
