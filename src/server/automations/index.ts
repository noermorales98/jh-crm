import type { CreditReport, CreditRound, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { writeActivityLog } from "@/src/server/activity";
import { toActivityContext } from "@/src/server/context";
import type { OrganizationContext } from "@/src/server/auth/guards";

type OrgIdOrCtx = string | OrganizationContext | { organizationId: string; userId?: string | null };

function orgIdOf(ctx: OrgIdOrCtx): string {
  return typeof ctx === "string" ? ctx : ctx.organizationId;
}

function actorOf(ctx: OrgIdOrCtx): string | null {
  if (typeof ctx === "string") return null;
  return "userId" in ctx ? (ctx.userId ?? null) : null;
}

async function firstOwnerUserId(organizationId: string, dbClient: Prisma.TransactionClient = prisma): Promise<string | null> {
  const owner = await dbClient.organizationMember.findFirst({
    where: {
      organizationId,
      role: "OWNER",
      user: { isActive: true },
    },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  return owner?.userId ?? null;
}

async function resolveTaskAssignee(
  organizationId: string,
  preferredId: string | null | undefined,
  dbClient: Prisma.TransactionClient = prisma,
): Promise<string | null> {
  if (preferredId) {
    const member = await dbClient.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId: preferredId, organizationId },
      },
      include: { user: { select: { isActive: true } } },
    });
    if (member?.user.isActive) return preferredId;
  }
  return firstOwnerUserId(organizationId, dbClient);
}

const LEAD_FOLLOW_UP_TITLE = "Seguimiento: Nuevo lead";
const LEAD_FOLLOW_UP_DESC = "Nuevo lead — contactar en 24 h.";

/**
 * Tarea FOLLOW_UP idempotente para un prospecto nuevo.
 */
export async function ensureFollowUpTaskForLead(
  ctx: OrgIdOrCtx,
  clientId: string,
) {
  const organizationId = orgIdOf(ctx);
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true, assignedToId: true, firstName: true, lastName: true },
  });
  if (!client) return null;

  const existing = await prisma.task.findFirst({
    where: {
      organizationId,
      clientId: client.id,
      type: "FOLLOW_UP",
      status: "PENDING",
      OR: [
        { title: { contains: "Nuevo lead" } },
        { description: { contains: "Nuevo lead" } },
      ],
    },
  });
  if (existing) return existing;

  const assignedToId = await resolveTaskAssignee(
    organizationId,
    client.assignedToId,
  );
  if (!assignedToId) return null;

  const dueAt = new Date();
  dueAt.setUTCDate(dueAt.getUTCDate() + 1);

  return prisma.task.create({
    data: {
      organizationId,
      clientId: client.id,
      title: LEAD_FOLLOW_UP_TITLE,
      description: LEAD_FOLLOW_UP_DESC,
      type: "FOLLOW_UP",
      priority: "HIGH",
      status: "PENDING",
      dueAt,
      assignedToId,
      createdById: actorOf(ctx),
    },
  });
}

export async function onNewLead(organizationId: string, clientId: string) {
  return ensureFollowUpTaskForLead(organizationId, clientId);
}

/**
 * Intake links activos sin uso y creados hace >48 h → tarea FOLLOW_UP.
 */
export async function onIntakeLinkCreated(_ctx?: OrgIdOrCtx) {
  // Firma compatible; el cron llama scanIncompleteIntakeFollowUps.
  return scanIncompleteIntakeFollowUps();
}

export async function scanIncompleteIntakeFollowUps(
  now = new Date(),
  organizationId?: string,
) {
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const links = await prisma.intakeLink.findMany({
    where: {
      isActive: true,
      useCount: 0,
      clientId: { not: null },
      createdAt: { lt: cutoff },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(organizationId ? { organizationId } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      caseId: true,
      client: { select: { assignedToId: true } },
      case: { select: { serviceCaseId: true } },
    },
    take: 200,
  });

  let created = 0;
  for (const link of links) {
    if (!link.clientId) continue;
    const title = "Formulario sin completar";
    const existing = await prisma.task.findFirst({
      where: {
        organizationId: link.organizationId,
        clientId: link.clientId,
        type: "FOLLOW_UP",
        status: { in: ["PENDING", "IN_PROGRESS"] },
        OR: [
          { title },
          { title: "Intake sin completar" },
          { description: { contains: `intake:${link.id}` } },
        ],
      },
    });
    if (existing) continue;

    const assignedToId = await resolveTaskAssignee(
      link.organizationId,
      link.client?.assignedToId,
    );
    if (!assignedToId) continue;

    await prisma.task.create({
      data: {
        organizationId: link.organizationId,
        clientId: link.clientId,
        caseId: link.caseId,
        serviceCaseId: link.case?.serviceCaseId ?? null,
        title,
        description: `El enlace de intake lleva más de 48 h sin usarse. (intake:${link.id})`,
        type: "FOLLOW_UP",
        priority: "NORMAL",
        status: "PENDING",
        dueAt: now,
        assignedToId,
      },
    });
    created += 1;
  }
  return { scanned: links.length, created };
}

/**
 * Tras marcar ronda como enviada: asegura expectedReviewAt (+30 d) y tarea de revisión.
 */
export async function onRoundSent(
  ctx: OrganizationContext,
  round: Pick<
    CreditRound,
    | "id"
    | "organizationId"
    | "caseId"
    | "roundNumber"
    | "expectedReviewAt"
  > & {
    case?: { clientId: string; assignedToId: string | null; caseCode?: string };
  },
) {
  if (round.organizationId !== ctx.organizationId) return null;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM CreditRound WHERE id = ${round.id} AND organizationId = ${ctx.organizationId} FOR UPDATE`;
    const current = await tx.creditRound.findFirst({
      where: { id: round.id, organizationId: ctx.organizationId },
      include: { case: { include: { serviceCase: true } } },
    });
    if (!current || !["SENT", "WAITING_UPDATE"].includes(current.status) ||
        !["OPEN", "ON_HOLD"].includes(current.case.serviceCase.status) || current.case.serviceCase.archivedAt) return null;
    const creditCase = current.case;
    let expectedReviewAt = current.expectedReviewAt;
    if (!expectedReviewAt) {
      expectedReviewAt = new Date(current.sentAt ?? current.startedAt);
      expectedReviewAt.setUTCDate(expectedReviewAt.getUTCDate() + 30);
      await tx.creditRound.update({ where: { id: current.id }, data: { expectedReviewAt } });
      await tx.serviceCase.update({ where: { id: creditCase.serviceCaseId }, data: { nextActionAt: expectedReviewAt } });
    }
    const titleNeedle = `Revisar ronda ${current.roundNumber}`;
    // Reconoce ambos tipos y títulos legacy. Una revisión completada no se recrea.
    const existing = await tx.task.findFirst({
      where: { organizationId: ctx.organizationId, roundId: current.id, status: { not: "CANCELLED" },
        OR: [{ type: { in: ["CREDIT_UPDATE", "REVIEW_RESULT"] } }, { title: { contains: titleNeedle } }] },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      const task = existing.serviceCaseId === creditCase.serviceCaseId ? existing : await tx.task.update({ where: { id: existing.id }, data: { serviceCaseId: creditCase.serviceCaseId } });
      return { expectedReviewAt, task };
    }
    const assignedToId = await resolveTaskAssignee(ctx.organizationId, creditCase.assignedToId ?? ctx.userId, tx);
    if (!assignedToId) return { expectedReviewAt, task: null };
    const task = await tx.task.create({ data: {
      organizationId: ctx.organizationId, clientId: creditCase.clientId, caseId: creditCase.id, serviceCaseId: creditCase.serviceCaseId,
      roundId: current.id, title: `${titleNeedle} (${creditCase.caseCode})`, description: `Revisar resultado de la ronda ${current.roundNumber}.`,
      type: "REVIEW_RESULT", priority: "NORMAL", status: "PENDING", dueAt: expectedReviewAt, reminderAt: expectedReviewAt,
      assignedToId, createdById: ctx.userId,
    } });
    await writeActivityLog(toActivityContext(ctx), { type: "TASK_CREATED", clientId: creditCase.clientId, caseId: creditCase.id,
      serviceCaseId: creditCase.serviceCaseId, roundId: current.id, description: task.title, metadata: { taskId: task.id, source: "round_sent" } }, tx);
    return { expectedReviewAt, task };
  }, { timeout: 15000 });
}

/**
 * Si el reporte es UPDATE → tarea para analizar.
 */
export async function onCreditReportCreated(
  ctx: OrganizationContext,
  report: Pick<CreditReport, "id" | "organizationId" | "clientId" | "caseId" | "type">,
) {
  if (report.type !== "UPDATE") return null;
  if (report.organizationId !== ctx.organizationId) return null;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM CreditReport WHERE id = ${report.id} AND organizationId = ${ctx.organizationId} FOR UPDATE`;
    const current = await tx.creditReport.findFirst({ where: { id: report.id, organizationId: ctx.organizationId, type: "UPDATE" }, include: { case: { include: { serviceCase: true } } } });
    if (!current || !["OPEN", "ON_HOLD"].includes(current.case.serviceCase.status) || current.case.serviceCase.archivedAt) return null;
    const title = "Analizar reporte actualizado";
    const existing = await tx.task.findFirst({ where: { organizationId: ctx.organizationId, caseId: current.caseId, clientId: current.clientId,
      status: { not: "CANCELLED" }, title, description: { contains: `report:${current.id}` } } });
    if (existing) return existing.serviceCaseId === current.case.serviceCaseId ? existing : tx.task.update({ where: { id: existing.id }, data: { serviceCaseId: current.case.serviceCaseId } });
    const assignedToId = await resolveTaskAssignee(ctx.organizationId, current.case.assignedToId ?? ctx.userId, tx);
    if (!assignedToId) return null;
    const dueAt = new Date(); dueAt.setUTCDate(dueAt.getUTCDate() + 2);
    const task = await tx.task.create({ data: { organizationId: ctx.organizationId, clientId: current.clientId, caseId: current.caseId,
      serviceCaseId: current.case.serviceCaseId, title, description: `Analizar reporte de crédito actualizado. (report:${current.id})`,
      type: "FOLLOW_UP", priority: "NORMAL", status: "PENDING", dueAt, assignedToId, createdById: ctx.userId } });
    await writeActivityLog(toActivityContext(ctx), { type: "TASK_CREATED", clientId: current.clientId, caseId: current.caseId, serviceCaseId: current.case.serviceCaseId,
      description: task.title, metadata: { taskId: task.id, source: "credit_report_update" } }, tx);
    return task;
  }, { timeout: 15000 });
}

/**
 * Casos en etapa DOCUMENTS_PENDING sin tarea abierta REQUEST_DOCUMENT.
 */
export async function ensureDocsPendingTask(organizationId?: string) {
  const where: Prisma.CreditCaseWhereInput = {
    state: "OPEN",
    stage: { key: "DOCUMENTS_PENDING" },
    serviceCase: { archivedAt: null, status: "OPEN" },
    client: { archivedAt: null },
    ...(organizationId ? { organizationId } : {}),
  };

  const cases = await prisma.creditCase.findMany({
    where,
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      caseCode: true,
      assignedToId: true,
      serviceCaseId: true,
    },
    take: 200,
  });

  let created = 0;
  for (const creditCase of cases) {
    const existing = await prisma.task.findFirst({
      where: {
        organizationId: creditCase.organizationId,
        caseId: creditCase.id,
        type: "REQUEST_DOCUMENT",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });
    if (existing) continue;

    const assignedToId = await resolveTaskAssignee(
      creditCase.organizationId,
      creditCase.assignedToId,
    );
    if (!assignedToId) continue;

    const dueAt = new Date();
    dueAt.setUTCDate(dueAt.getUTCDate() + 3);

    await prisma.task.create({
      data: {
        organizationId: creditCase.organizationId,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        serviceCaseId: creditCase.serviceCaseId,
        title: `Solicitar documentos — ${creditCase.caseCode}`,
        description: "El caso está en etapa Documentos pendientes.",
        type: "REQUEST_DOCUMENT",
        priority: "HIGH",
        status: "PENDING",
        dueAt,
        assignedToId,
      },
    });
    created += 1;
  }

  return { scanned: cases.length, created };
}
