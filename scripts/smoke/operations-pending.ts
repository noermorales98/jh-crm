/**
 * Regresión de operación: revisión única por ronda + enlace canónico de tareas,
 * ensureDocsPendingTask e intake follow-up (org temporal aislada).
 *
 * Uso: npx tsx --env-file=.env.local scripts/smoke/operations-pending.ts
 */
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createServiceCase, moveCaseToStage } from "../../src/server/cases";
import { createRound, markRoundSent } from "../../src/server/rounds";
import {
  onRoundSent,
  onCreditReportCreated,
  ensureDocsPendingTask,
  scanIncompleteIntakeFollowUps,
} from "../../src/server/automations";
import { createCreditReport } from "../../src/server/credit-reports";
import { ensureCreditRepairService } from "../../src/server/services";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `ops-${Date.now()}`;
let checks = 0;

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  checks++;
  console.log(`✓ ${label}`);
}

const CREDIT_STAGES = [
  { key: "NEW", name: "Nuevo cliente", order: 1, color: "#3B82F6" },
  { key: "DOCUMENTS_PENDING", name: "Documentos pendientes", order: 2, color: "#F59E0B" },
  { key: "ANALYSIS", name: "En análisis", order: 3, color: "#8B5CF6" },
  { key: "COMPLETED", name: "Finalizado", order: 10, color: "#22C55E", isTerminal: true },
] as const;

async function main() {
  const prisma = new PrismaClient();
  let clientId: string | null = null;
  let serviceCaseId: string | null = null;
  let tempOrgId: string | null = null;

  try {
    const owner = await prisma.organizationMember.findFirstOrThrow({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    const ctx: OrganizationContext = {
      userId: owner.userId,
      organizationId: owner.organizationId,
      role: owner.role,
    };

    // ── Rondas / reportes (org OWNER) ─────────────────────────────
    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: MARK.slice(0, 20),
        firstName: MARK,
        assignedToId: ctx.userId,
      },
    });
    clientId = client.id;
    const c = await createServiceCase(ctx, {
      clientId: client.id,
      serviceCode: "CREDIT_REPAIR",
      assignedToId: ctx.userId,
    });
    serviceCaseId = c.serviceCase.id;

    const round = await createRound(ctx, { caseId: c.creditCase!.id });
    const due = new Date(Date.now() + 30 * 86400000);
    await markRoundSent(ctx, round.id, {
      expectedReviewAt: due,
      createReviewTask: true,
    });
    let tasks = await prisma.task.findMany({
      where: {
        roundId: round.id,
        type: { in: ["CREDIT_UPDATE", "REVIEW_RESULT"] },
      },
    });
    check("enviar ronda crea una sola tarea de revisión", tasks.length === 1);
    check(
      "tarea de revisión enlazada a ServiceCase",
      tasks[0].serviceCaseId === c.serviceCase.id,
    );

    const sent = await prisma.creditRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    await Promise.all([onRoundSent(ctx, sent), onRoundSent(ctx, sent)]);
    tasks = await prisma.task.findMany({
      where: {
        roundId: round.id,
        type: { in: ["CREDIT_UPDATE", "REVIEW_RESULT"] },
      },
    });
    check("hook repetido y concurrente no duplica tareas", tasks.length === 1);
    check("respeta la fecha acordada", tasks[0].dueAt?.getTime() === due.getTime());

    await prisma.task.update({
      where: { id: tasks[0].id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await onRoundSent(ctx, sent);
    check(
      "hook no reabre ni recrea revisión completada",
      (await prisma.task.count({
        where: {
          roundId: round.id,
          type: { in: ["CREDIT_UPDATE", "REVIEW_RESULT"] },
        },
      })) === 1,
    );

    const second = await createRound(ctx, { caseId: c.creditCase!.id });
    const auto = await markRoundSent(ctx, second.id, {
      expectedReviewAt: due,
      createReviewTask: false,
    });
    const fallback = await prisma.task.findMany({
      where: { roundId: second.id, type: "REVIEW_RESULT" },
    });
    check(
      "fallback crea revisión única cuando no hubo tarea manual",
      auto.reviewTask === null &&
        fallback.length === 1 &&
        fallback[0].serviceCaseId === c.serviceCase.id,
    );

    const legacy = await createRound(ctx, { caseId: c.creditCase!.id });
    const sentAt = new Date("2026-09-01T12:00:00Z");
    await prisma.creditRound.update({
      where: { id: legacy.id },
      data: { status: "SENT", sentAt, expectedReviewAt: null },
    });
    const legacySent = await prisma.creditRound.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    const legacyAuto = await onRoundSent(ctx, legacySent);
    check(
      "fallback legacy fecha +30 días desde envío",
      legacyAuto?.expectedReviewAt.toISOString() === "2026-10-01T12:00:00.000Z",
    );

    const report = await createCreditReport(ctx, {
      caseId: c.creditCase!.id,
      reportDate: new Date(),
      type: "UPDATE",
      snapshots: [],
    });
    const analysisTask = await prisma.task.findFirstOrThrow({
      where: {
        caseId: c.creditCase!.id,
        description: { contains: `report:${report.id}` },
      },
    });
    check(
      "tarea automática de reporte enlazada a ServiceCase",
      analysisTask.serviceCaseId === c.serviceCase.id,
    );
    await onCreditReportCreated(ctx, report);
    check(
      "repetir hook de reporte conserva una tarea",
      (await prisma.task.count({
        where: {
          caseId: c.creditCase!.id,
          description: { contains: `report:${report.id}` },
        },
      })) === 1,
    );

    // ── Docs pending + intake (org temporal) ──────────────────────
    const tempOrg = await prisma.organization.create({
      data: {
        name: MARK,
        settings: { create: {} },
        members: { create: { userId: owner.userId, role: "OWNER" } },
      },
    });
    tempOrgId = tempOrg.id;
    const tempCtx: OrganizationContext = {
      userId: owner.userId,
      organizationId: tempOrg.id,
      role: "OWNER",
    };

    const service = await ensureCreditRepairService(tempOrg.id);
    for (const stage of CREDIT_STAGES) {
      await prisma.workflowStage.create({
        data: {
          organizationId: tempOrg.id,
          serviceId: service.id,
          key: stage.key,
          name: stage.name,
          order: stage.order,
          color: stage.color,
          isTerminal: "isTerminal" in stage ? stage.isTerminal : false,
          isActive: true,
        },
      });
    }

    const tempClient = await prisma.client.create({
      data: {
        organizationId: tempOrg.id,
        clientCode: `T-${MARK}`.slice(0, 20),
        firstName: "OPS-TEMP",
        lastName: MARK,
        status: "ACTIVE",
        assignedToId: owner.userId,
      },
    });
    const tempCase = await createServiceCase(tempCtx, {
      clientId: tempClient.id,
      serviceCode: "CREDIT_REPAIR",
      assignedToId: owner.userId,
    });
    const docsStage = await prisma.workflowStage.findFirstOrThrow({
      where: {
        organizationId: tempOrg.id,
        serviceId: service.id,
        key: "DOCUMENTS_PENDING",
      },
    });
    await moveCaseToStage(tempCtx, tempCase.creditCase!.id, docsStage.id);

    const docsFirst = await ensureDocsPendingTask(tempOrg.id);
    const docsTasks = await prisma.task.findMany({
      where: {
        organizationId: tempOrg.id,
        caseId: tempCase.creditCase!.id,
        type: "REQUEST_DOCUMENT",
      },
    });
    check(
      "ensureDocsPendingTask crea una sola tarea canónica",
      docsFirst.created === 1 && docsTasks.length === 1,
    );
    check(
      "tarea REQUEST_DOCUMENT enlazada a serviceCaseId",
      docsTasks[0].serviceCaseId === tempCase.serviceCase.id,
    );

    const docsSecond = await ensureDocsPendingTask(tempOrg.id);
    check(
      "ensureDocsPendingTask es idempotente",
      docsSecond.created === 0 &&
        (await prisma.task.count({
          where: {
            organizationId: tempOrg.id,
            caseId: tempCase.creditCase!.id,
            type: "REQUEST_DOCUMENT",
          },
        })) === 1,
    );

    const now = new Date();
    const createdAt = new Date(now.getTime() - 49 * 60 * 60 * 1000);
    const intakeLink = await prisma.intakeLink.create({
      data: {
        organizationId: tempOrg.id,
        token: `smoke-${crypto.randomBytes(16).toString("base64url")}`,
        clientId: tempClient.id,
        caseId: tempCase.creditCase!.id,
        createdById: owner.userId,
        useCount: 0,
        isActive: true,
        maxUses: 1,
        expiresAt: null,
        createdAt,
      },
    });

    const intakeFirst = await scanIncompleteIntakeFollowUps(now, tempOrg.id);
    const intakeTasks = await prisma.task.findMany({
      where: {
        organizationId: tempOrg.id,
        clientId: tempClient.id,
        type: "FOLLOW_UP",
        description: { contains: `intake:${intakeLink.id}` },
      },
    });
    check(
      "intake follow-up canónico con serviceCaseId",
      intakeFirst.created === 1 &&
        intakeTasks.length === 1 &&
        intakeTasks[0].serviceCaseId === tempCase.serviceCase.id,
    );

    const intakeSecond = await scanIncompleteIntakeFollowUps(now, tempOrg.id);
    check(
      "intake follow-up no se duplica",
      intakeSecond.created === 0 &&
        (await prisma.task.count({
          where: {
            organizationId: tempOrg.id,
            clientId: tempClient.id,
            type: "FOLLOW_UP",
            description: { contains: `intake:${intakeLink.id}` },
          },
        })) === 1,
    );

    console.log(`OPERATIONS: ${checks}/${checks} OK`);
  } finally {
    if (serviceCaseId) {
      await prisma.auditLog
        .deleteMany({ where: { entityId: serviceCaseId } })
        .catch(() => undefined);
    }
    if (clientId) {
      await prisma.activityLog
        .deleteMany({ where: { clientId } })
        .catch(() => undefined);
      await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
    }
    if (tempOrgId) {
      await prisma.organization
        .delete({ where: { id: tempOrgId } })
        .catch(() => undefined);
      console.log(`[cleanup] temp org ${MARK}`);
    }
    await prisma.$disconnect();
    console.log(`[cleanup] ${MARK}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
