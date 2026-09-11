/**
 * Smoke SC-003: ServiceCase.nextActionAt es la fuente operativa canónica.
 *
 * Uso: npx tsx --env-file=.env.local scripts/smoke/sc-003-next-action.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  createCreditCase,
  getCaseDetail,
  setNextActionAt,
} from "../../src/server/cases";
import { getDashboardSummary } from "../../src/server/dashboard";
import { createRound, markRoundSent } from "../../src/server/rounds";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `sc003-${Date.now()}`;

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  let clientId: string | null = null;
  let caseId: string | null = null;
  let serviceCaseId: string | null = null;
  let roundId: string | null = null;

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

    console.log("\n[SC-003] ServiceCase.nextActionAt");

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "SC003",
        lastName: MARK,
        status: "ACTIVE",
        assignedToId: member.userId,
      },
    });
    clientId = client.id;

    const created = await createCreditCase(ctx, {
      clientId: client.id,
      assignedToId: member.userId,
      summary: `Smoke SC-003 ${MARK}`,
    });
    caseId = created.id;
    serviceCaseId = created.serviceCaseId;

    // Centinela legacy: SC-003 no debe volver a escribir nextReviewAt.
    const legacyReview = new Date("2026-01-15T12:00:00.000Z");
    await prisma.creditCase.update({
      where: { id: created.id },
      data: { nextReviewAt: legacyReview },
    });

    const nextAction = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await setNextActionAt(ctx, created.id, nextAction);

    const [serviceCase, creditCase, detail, dashboard] = await Promise.all([
      prisma.serviceCase.findUniqueOrThrow({ where: { id: created.serviceCaseId } }),
      prisma.creditCase.findUniqueOrThrow({ where: { id: created.id } }),
      getCaseDetail(ctx, created.id),
      getDashboardSummary(ctx),
    ]);

    check(
      "guarda ServiceCase.nextActionAt",
      serviceCase.nextActionAt?.getTime() === nextAction.getTime(),
    );
    check(
      "no escribe CreditCase.nextReviewAt",
      creditCase.nextReviewAt?.getTime() === legacyReview.getTime(),
    );
    check(
      "ficha lee nextActionAt canónico",
      detail.case.serviceCase.nextActionAt?.getTime() === nextAction.getTime(),
    );

    const dashboardItem = dashboard.widgets.casesWaitingUpdate.items.find(
      (item) => item.serviceCaseId === created.serviceCaseId,
    );
    check("dashboard incluye la próxima acción", Boolean(dashboardItem));
    check(
      "dashboard expone nextActionAt",
      dashboardItem?.nextActionAt?.getTime() === nextAction.getTime(),
    );

    await setNextActionAt(ctx, created.id, null);
    const cleared = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: created.serviceCaseId },
    });
    check("permite eliminar la fecha", cleared.nextActionAt == null);

    const round = await createRound(ctx, { caseId: created.id });
    roundId = round.id;
    const expectedReviewAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
    await markRoundSent(ctx, round.id, {
      expectedReviewAt,
      createReviewTask: false,
    });
    const afterRound = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: created.serviceCaseId },
    });
    check(
      "ronda enviada programa nextActionAt",
      afterRound.nextActionAt?.getTime() === expectedReviewAt.getTime(),
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          caseId: created.id,
          serviceCaseId: created.serviceCaseId,
        },
        null,
        2,
      ),
    );
  } finally {
    console.log("\n[cleanup]");
    if (clientId) {
      await prisma.activityLog
        .deleteMany({ where: { clientId } })
        .catch(() => undefined);
      await prisma.task.deleteMany({ where: { clientId } }).catch(() => undefined);
    }
    if (roundId) {
      await prisma.creditRound.deleteMany({ where: { id: roundId } }).catch(() => undefined);
    }
    if (caseId) {
      await prisma.creditCase.deleteMany({ where: { id: caseId } }).catch(() => undefined);
    }
    if (serviceCaseId) {
      await prisma.serviceCaseStageHistory
        .deleteMany({ where: { serviceCaseId } })
        .catch(() => undefined);
      await prisma.serviceCase
        .deleteMany({ where: { id: serviceCaseId } })
        .catch(() => undefined);
    }
    if (clientId) {
      await prisma.client.deleteMany({ where: { id: clientId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
