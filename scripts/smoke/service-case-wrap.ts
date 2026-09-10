/**
 * Smoke ARC-003/004: createCreditCase wrap + moveCaseToStage + StageHistory.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/service-case-wrap.ts
 */
import { PrismaClient } from "@prisma/client";
import { createCreditCase, moveCaseToStage } from "../../src/server/cases";
import type { OrganizationContext } from "../../src/server/auth/guards";

async function main() {
  const prisma = new PrismaClient();
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

    const client = await prisma.client.findFirst({
      where: {
        organizationId: ctx.organizationId,
        status: { not: "ARCHIVED" },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!client) throw new Error("No hay cliente para smoke.");

    const stages = await prisma.workflowStage.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      orderBy: { order: "asc" },
      take: 2,
    });
    if (stages.length < 2) throw new Error("Se necesitan ≥2 etapas activas.");

    const created = await createCreditCase(ctx, {
      clientId: client.id,
      assignedToId: member.userId,
      summary: "Smoke ARC-003 wrap",
      nextReviewAt: new Date(Date.now() + 7 * 86400000),
    });

    if (!created.serviceCaseId) {
      throw new Error("CreditCase sin serviceCaseId");
    }

    const sc = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: created.serviceCaseId },
    });
    if (sc.caseNumber !== created.caseCode) {
      throw new Error("caseNumber != caseCode");
    }
    if (sc.nextActionAt?.getTime() !== created.nextReviewAt?.getTime()) {
      throw new Error("nextActionAt no copió nextReviewAt");
    }

    const target = stages.find((s) => s.id !== created.stage.id) ?? stages[1]!;
    await moveCaseToStage(ctx, created.id, target.id);

    const [cc, sc2, hist] = await Promise.all([
      prisma.creditCase.findUniqueOrThrow({ where: { id: created.id } }),
      prisma.serviceCase.findUniqueOrThrow({ where: { id: created.serviceCaseId } }),
      prisma.serviceCaseStageHistory.findMany({
        where: { serviceCaseId: created.serviceCaseId },
      }),
    ]);

    if (cc.stageId !== target.id || sc2.stageId !== target.id) {
      throw new Error("dual-write stageId falló");
    }
    if (hist.length < 1) {
      throw new Error("StageHistory vacío tras move");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          caseId: created.id,
          serviceCaseId: created.serviceCaseId,
          caseCode: created.caseCode,
          movedTo: target.key,
          historyCount: hist.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
