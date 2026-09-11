/**
 * Smoke SC-001: crear expediente (ServiceCase + CreditCase wrap).
 * Uso: npx tsx --env-file=.env.local scripts/smoke/sc-001-create.ts
 */
import { PrismaClient } from "@prisma/client";
import { createCreditCase } from "../../src/server/cases";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `sc001-${Date.now()}`;

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

    console.log("\n[SC-001] createCreditCase → ServiceCase + CreditCase");

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "SC001",
        lastName: MARK,
        status: "ACTIVE",
        assignedToId: member.userId,
      },
    });
    clientId = client.id;

    const nextAction = new Date(Date.now() + 3 * 86400000);
    const created = await createCreditCase(ctx, {
      clientId: client.id,
      assignedToId: member.userId,
      summary: `Smoke SC-001 ${MARK}`,
      nextActionAt: nextAction,
    });
    caseId = created.id;
    serviceCaseId = created.serviceCaseId;

    check("CreditCase id", Boolean(created.id));
    check("serviceCaseId set", Boolean(created.serviceCaseId));
    check("caseCode generated", Boolean(created.caseCode));

    const sc = await prisma.serviceCase.findUniqueOrThrow({
      where: { id: created.serviceCaseId },
      include: {
        service: { select: { id: true, code: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    });

    check("asociado a cliente", sc.clientId === client.id);
    check("asociado a servicio", Boolean(sc.serviceId) && sc.service.code === "CREDIT_REPAIR");
    check("caseNumber == caseCode", sc.caseNumber === created.caseCode);
    check("status OPEN", sc.status === "OPEN");
    check("stageId inicial", sc.stageId === created.stage.id);
    check("nextActionAt", sc.nextActionAt?.getTime() === nextAction.getTime());

    const cc = await prisma.creditCase.findUniqueOrThrow({
      where: { id: created.id },
    });
    check("CreditCase 1:1", cc.serviceCaseId === sc.id);
    check("same stage dual-write", cc.stageId === sc.stageId);

    const hist = await prisma.serviceCaseStageHistory.findMany({
      where: { serviceCaseId: sc.id },
      orderBy: { changedAt: "asc" },
    });
    check("StageHistory apertura", hist.length >= 1);
    check("fromStageId null al crear", hist[0]!.fromStageId == null);
    check("toStageId = etapa inicial", hist[0]!.toStageId === sc.stageId);

    const activity = await prisma.activityLog.findFirst({
      where: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        type: "CREATED",
        serviceCaseId: sc.id,
      },
      orderBy: { createdAt: "desc" },
    });
    check("Activity CREATED", Boolean(activity));
    check("Activity caseId", activity?.caseId === created.id);

    console.log(
      JSON.stringify(
        {
          ok: true,
          caseId: created.id,
          serviceCaseId: sc.id,
          caseNumber: sc.caseNumber,
          serviceCode: sc.service.code,
          stage: sc.stage.name,
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
