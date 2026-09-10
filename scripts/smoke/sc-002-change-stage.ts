/**
 * Smoke SC-002: cambiar etapa (StageHistory + Activity, sin string stage).
 * Uso: npx tsx --env-file=.env.local scripts/smoke/sc-002-change-stage.ts
 */
import { PrismaClient } from "@prisma/client";
import { createCreditCase, moveCaseToStage } from "../../src/server/cases";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `sc002-${Date.now()}`;

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  let clientId: string | null = null;
  let caseId: string | null = null;
  let serviceCaseId: string | null = null;

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

    console.log("\n[SC-002] moveCaseToStage");

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "SC002",
        lastName: MARK,
        status: "ACTIVE",
        assignedToId: member.userId,
      },
    });
    clientId = client.id;

    const created = await createCreditCase(ctx, {
      clientId: client.id,
      assignedToId: member.userId,
      summary: `Smoke SC-002 ${MARK}`,
    });
    caseId = created.id;
    serviceCaseId = created.serviceCaseId;

    const sc0 = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: created.serviceCaseId },
    });

    const stages = await prisma.workflowStage.findMany({
      where: {
        organizationId: ctx.organizationId,
        serviceId: sc0.serviceId,
        isActive: true,
      },
      orderBy: { order: "asc" },
      take: 3,
    });
    if (stages.length < 2) throw new Error("Se necesitan ≥2 etapas.");

    const fromId = sc0.stageId;
    const toStage = stages.find((s) => s.id !== fromId) ?? stages[1]!;

    const histBefore = await prisma.serviceCaseStageHistory.count({
      where: { serviceCaseId: created.serviceCaseId },
    });

    const moved = await moveCaseToStage(ctx, created.id, toStage.id);
    check("CreditCase stageId updated", moved.stage.id === toStage.id);

    const [cc, sc] = await Promise.all([
      prisma.creditCase.findUniqueOrThrow({ where: { id: created.id } }),
      prisma.serviceCase.findUniqueOrThrow({ where: { id: created.serviceCaseId } }),
    ]);
    check("dual-write ServiceCase.stageId", sc.stageId === toStage.id);
    check("dual-write CreditCase.stageId", cc.stageId === toStage.id);
    check("same service stages", sc.serviceId === sc0.serviceId);

    // No hay campo string `stage` en ServiceCase — solo stageId.
    check("has stageId FK", typeof sc.stageId === "string");

    const hist = await prisma.serviceCaseStageHistory.findMany({
      where: { serviceCaseId: created.serviceCaseId },
      orderBy: { changedAt: "desc" },
    });
    check("historial creció (no rebuild)", hist.length === histBefore + 1);
    const last = hist[0]!;
    check("fromStageId", last.fromStageId === fromId);
    check("toStageId", last.toStageId === toStage.id);
    check("actor", last.changedById === member.userId);
    check("fecha changedAt", Boolean(last.changedAt));

    const activity = await prisma.activityLog.findFirst({
      where: {
        organizationId: ctx.organizationId,
        caseId: created.id,
        type: "STAGE_CHANGE",
      },
      orderBy: { createdAt: "desc" },
    });
    check("Activity STAGE_CHANGE", Boolean(activity));
    const meta = (activity?.metadata ?? {}) as Record<string, unknown>;
    check("metadata fromStageId", meta.fromStageId === fromId);
    check("metadata toStageId", meta.toStageId === toStage.id);

    let rejectedSame = false;
    try {
      await moveCaseToStage(ctx, created.id, toStage.id);
    } catch {
      rejectedSame = true;
    }
    check("reject same stage", rejectedSame);

    // Etapa de otro servicio (si existe) debe fallar.
    const otherService = await prisma.service.findFirst({
      where: {
        organizationId: ctx.organizationId,
        id: { not: sc0.serviceId },
        isActive: true,
      },
    });
    if (otherService) {
      const foreignStage = await prisma.workflowStage.findFirst({
        where: {
          organizationId: ctx.organizationId,
          serviceId: otherService.id,
          isActive: true,
        },
      });
      if (foreignStage) {
        let rejectedForeign = false;
        try {
          await moveCaseToStage(ctx, created.id, foreignStage.id);
        } catch {
          rejectedForeign = true;
        }
        check("reject foreign service stage", rejectedForeign);
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          caseId: created.id,
          from: fromId,
          to: toStage.id,
          historyCount: hist.length,
        },
        null,
        2,
      ),
    );
  } finally {
    console.log("\n[cleanup]");
    if (serviceCaseId) {
      await prisma.serviceCaseStageHistory
        .deleteMany({ where: { serviceCaseId } })
        .catch(() => undefined);
    }
    if (caseId) {
      await prisma.creditCase.deleteMany({ where: { id: caseId } }).catch(() => undefined);
    }
    if (serviceCaseId) {
      await prisma.serviceCase
        .deleteMany({ where: { id: serviceCaseId } })
        .catch(() => undefined);
    }
    if (clientId) {
      await prisma.activityLog
        .deleteMany({ where: { clientId } })
        .catch(() => undefined);
      await prisma.client.deleteMany({ where: { id: clientId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
