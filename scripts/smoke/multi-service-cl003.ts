/**
 * Smoke CL-003 / BR-001: múltiples ServiceCase por cliente, etapas/pagos/tareas independientes.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/multi-service-cl003.ts
 */
import { PrismaClient } from "@prisma/client";
import { createCreditCase, moveCaseToStage } from "../../src/server/cases";
import { createTask } from "../../src/server/tasks";
import { registerPayment } from "../../src/server/payments";
import { listTasks } from "../../src/server/tasks";
import { listPayments } from "../../src/server/payments";
import { getClientOverview } from "../../src/server/clients/overview";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `cl003-${Date.now()}`;

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  let clientId: string | null = null;
  const caseIds: string[] = [];
  const serviceCaseIds: string[] = [];
  const taskIds: string[] = [];
  const paymentIds: string[] = [];

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

    console.log("\n[CL-003] dos ServiceCase + stages/pagos/tareas independientes");

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "Multi",
        lastName: MARK,
        status: "ACTIVE",
        assignedToId: member.userId,
      },
    });
    clientId = client.id;

    const a = await createCreditCase(ctx, {
      clientId: client.id,
      assignedToId: member.userId,
      summary: `CL-003 A ${MARK}`,
    });
    const b = await createCreditCase(ctx, {
      clientId: client.id,
      assignedToId: member.userId,
      summary: `CL-003 B ${MARK}`,
    });
    caseIds.push(a.id, b.id);
    serviceCaseIds.push(a.serviceCaseId, b.serviceCaseId);

    check("two CreditCases", caseIds.length === 2);
    check("distinct ServiceCase ids", a.serviceCaseId !== b.serviceCaseId);

    const stages = await prisma.workflowStage.findMany({
      where: {
        organizationId: ctx.organizationId,
        serviceId: (
          await prisma.serviceCase.findUniqueOrThrow({
            where: { id: a.serviceCaseId },
          })
        ).serviceId,
        isActive: true,
      },
      orderBy: { order: "asc" },
      take: 3,
    });
    if (stages.length < 2) throw new Error("Se necesitan ≥2 etapas activas.");

    const stageA = stages[0]!;
    const stageB = stages[1]!;

    if (a.stage.id !== stageA.id) {
      await moveCaseToStage(ctx, a.id, stageA.id);
    }
    await moveCaseToStage(ctx, b.id, stageB.id);

    const [scA, scB] = await Promise.all([
      prisma.serviceCase.findUniqueOrThrow({ where: { id: a.serviceCaseId } }),
      prisma.serviceCase.findUniqueOrThrow({ where: { id: b.serviceCaseId } }),
    ]);
    check("independent stageId", scA.stageId !== scB.stageId);
    check("B on second stage", scB.stageId === stageB.id);

    const taskA = await createTask(ctx, {
      title: `Task A ${MARK}`,
      clientId: client.id,
      caseId: a.id,
      assignedToId: member.userId,
      type: "FOLLOW_UP",
    });
    const taskB = await createTask(ctx, {
      title: `Task B ${MARK}`,
      clientId: client.id,
      caseId: b.id,
      assignedToId: member.userId,
      type: "CALL",
    });
    taskIds.push(taskA.id, taskB.id);

    check("task A serviceCaseId", taskA.serviceCaseId === a.serviceCaseId);
    check("task B serviceCaseId", taskB.serviceCaseId === b.serviceCaseId);

    const listedA = await listTasks(ctx, { caseId: a.id, limit: 20 });
    const listedB = await listTasks(ctx, { caseId: b.id, limit: 20 });
    check(
      "tasks scoped A",
      listedA.items.some((t) => t.id === taskA.id) &&
        !listedA.items.some((t) => t.id === taskB.id),
    );
    check(
      "tasks scoped B",
      listedB.items.some((t) => t.id === taskB.id) &&
        !listedB.items.some((t) => t.id === taskA.id),
    );

    const payA = await registerPayment(ctx, {
      clientId: client.id,
      caseId: a.id,
      amount: 100,
      method: "CASH",
      status: "RECEIVED",
      notes: `pay A ${MARK}`,
    });
    const payB = await registerPayment(ctx, {
      clientId: client.id,
      caseId: b.id,
      amount: 250,
      method: "ZELLE",
      status: "RECEIVED",
      notes: `pay B ${MARK}`,
    });
    paymentIds.push(payA.payment.id, payB.payment.id);

    check(
      "payment A serviceCaseId",
      payA.payment.serviceCaseId === a.serviceCaseId,
    );
    check(
      "payment B serviceCaseId",
      payB.payment.serviceCaseId === b.serviceCaseId,
    );

    const paysA = await listPayments(ctx, {
      clientId: client.id,
      caseId: a.id,
      limit: 20,
    });
    const paysB = await listPayments(ctx, {
      clientId: client.id,
      caseId: b.id,
      limit: 20,
    });
    check(
      "payments scoped A",
      paysA.items.some((p) => p.id === payA.payment.id) &&
        !paysA.items.some((p) => p.id === payB.payment.id),
    );
    check(
      "payments scoped B",
      paysB.items.some((p) => p.id === payB.payment.id) &&
        !paysB.items.some((p) => p.id === payA.payment.id),
    );

    const overviewA = await getClientOverview(ctx, client.id, {
      caseId: a.id,
    });
    const overviewB = await getClientOverview(ctx, client.id, {
      caseId: b.id,
    });
    check("overview lists ≥2 services", overviewA.services.length >= 2);
    check(
      "overview A active",
      overviewA.activeService?.creditCaseId === a.id,
    );
    check(
      "overview B active",
      overviewB.activeService?.creditCaseId === b.id,
    );
    check(
      "overview tasks scoped",
      overviewA.tasksSummary.openCount >= 1 &&
        overviewB.tasksSummary.openCount >= 1,
    );
    check(
      "independent stages in switcher",
      overviewA.activeService?.stage?.id !== overviewB.activeService?.stage?.id,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          clientId,
          cases: caseIds,
          serviceCases: serviceCaseIds,
          stages: { a: scA.stageId, b: scB.stageId },
        },
        null,
        2,
      ),
    );
  } finally {
    console.log("\n[cleanup]");
    if (paymentIds.length) {
      await prisma.receipt
        .deleteMany({ where: { paymentId: { in: paymentIds } } })
        .catch(() => undefined);
      await prisma.payment
        .deleteMany({ where: { id: { in: paymentIds } } })
        .catch(() => undefined);
    }
    if (taskIds.length) {
      await prisma.task
        .deleteMany({ where: { id: { in: taskIds } } })
        .catch(() => undefined);
    }
    if (caseIds.length) {
      await prisma.creditCase
        .deleteMany({ where: { id: { in: caseIds } } })
        .catch(() => undefined);
    }
    if (serviceCaseIds.length) {
      await prisma.serviceCaseStageHistory
        .deleteMany({ where: { serviceCaseId: { in: serviceCaseIds } } })
        .catch(() => undefined);
      await prisma.serviceCase
        .deleteMany({ where: { id: { in: serviceCaseIds } } })
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
