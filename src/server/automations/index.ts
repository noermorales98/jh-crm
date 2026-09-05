import type { CreditReport, CreditRound, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import type { OrganizationContext } from "@/src/server/auth/guards";

type OrgIdOrCtx = string | OrganizationContext | { organizationId: string; userId?: string | null };

function orgIdOf(ctx: OrgIdOrCtx): string {
  return typeof ctx === "string" ? ctx : ctx.organizationId;
}

function actorOf(ctx: OrgIdOrCtx): string | null {
  if (typeof ctx === "string") return null;
  return "userId" in ctx ? (ctx.userId ?? null) : null;
}

async function firstOwnerUserId(organizationId: string): Promise<string | null> {
  const owner = await prisma.organizationMember.findFirst({
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
): Promise<string | null> {
  if (preferredId) {
    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId: preferredId, organizationId },
      },
      include: { user: { select: { isActive: true } } },
    });
    if (member?.user.isActive) return preferredId;
  }
  return firstOwnerUserId(organizationId);
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

export async function scanIncompleteIntakeFollowUps(now = new Date()) {
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const links = await prisma.intakeLink.findMany({
    where: {
      isActive: true,
      useCount: 0,
      clientId: { not: null },
      createdAt: { lt: cutoff },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      organizationId: true,
      clientId: true,
      caseId: true,
      client: { select: { assignedToId: true } },
    },
    take: 200,
  });

  let created = 0;
  for (const link of links) {
    if (!link.clientId) continue;
    const title = "Intake sin completar";
    const existing = await prisma.task.findFirst({
      where: {
        organizationId: link.organizationId,
        clientId: link.clientId,
        type: "FOLLOW_UP",
        status: { in: ["PENDING", "IN_PROGRESS"] },
        OR: [
          { title },
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

  let creditCase = round.case;
  if (!creditCase) {
    const found = await prisma.creditCase.findFirst({
      where: { id: round.caseId, organizationId: ctx.organizationId },
      select: { clientId: true, assignedToId: true, caseCode: true },
    });
    if (!found) return null;
    creditCase = found;
  }

  let expectedReviewAt = round.expectedReviewAt;
  if (!expectedReviewAt) {
    expectedReviewAt = new Date();
    expectedReviewAt.setUTCDate(expectedReviewAt.getUTCDate() + 30);
    await prisma.creditRound.update({
      where: { id: round.id },
      data: { expectedReviewAt },
    });
  }

  const titleNeedle = `Revisar ronda ${round.roundNumber}`;
  const existing = await prisma.task.findFirst({
    where: {
      organizationId: ctx.organizationId,
      roundId: round.id,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      OR: [
        { type: "REVIEW_RESULT", title: { contains: titleNeedle } },
        { type: "FOLLOW_UP", title: { contains: titleNeedle } },
        { title: { contains: titleNeedle } },
      ],
    },
  });
  if (existing) {
    return { expectedReviewAt, task: existing };
  }

  const assignedToId = await resolveTaskAssignee(
    ctx.organizationId,
    creditCase.assignedToId ?? ctx.userId,
  );
  if (!assignedToId) return { expectedReviewAt, task: null };

  const task = await prisma.task.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: creditCase.clientId,
      caseId: round.caseId,
      roundId: round.id,
      title: `${titleNeedle}${creditCase.caseCode ? ` (${creditCase.caseCode})` : ""}`,
      description: `Revisar resultado de la ronda ${round.roundNumber}.`,
      type: "REVIEW_RESULT",
      priority: "NORMAL",
      status: "PENDING",
      dueAt: expectedReviewAt,
      reminderAt: expectedReviewAt,
      assignedToId,
      createdById: ctx.userId,
    },
  });

  return { expectedReviewAt, task };
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

  const title = "Analizar reporte actualizado";
  const existing = await prisma.task.findFirst({
    where: {
      organizationId: ctx.organizationId,
      caseId: report.caseId,
      clientId: report.clientId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      title,
      description: { contains: `report:${report.id}` },
    },
  });
  if (existing) return existing;

  const creditCase = await prisma.creditCase.findFirst({
    where: { id: report.caseId, organizationId: ctx.organizationId },
    select: { assignedToId: true },
  });
  const assignedToId = await resolveTaskAssignee(
    ctx.organizationId,
    creditCase?.assignedToId ?? ctx.userId,
  );
  if (!assignedToId) return null;

  const dueAt = new Date();
  dueAt.setUTCDate(dueAt.getUTCDate() + 2);

  return prisma.task.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: report.clientId,
      caseId: report.caseId,
      title,
      description: `Analizar reporte de crédito actualizado. (report:${report.id})`,
      type: "FOLLOW_UP",
      priority: "NORMAL",
      status: "PENDING",
      dueAt,
      assignedToId,
      createdById: ctx.userId,
    },
  });
}

/**
 * Casos en etapa DOCUMENTS_PENDING sin tarea abierta REQUEST_DOCUMENT.
 */
export async function ensureDocsPendingTask(organizationId?: string) {
  const where: Prisma.CreditCaseWhereInput = {
    state: "OPEN",
    stage: { key: "DOCUMENTS_PENDING" },
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
