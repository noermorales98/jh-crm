import type { CaseState, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { nextCaseCode } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";

/**
 * Servicio de casos de reparación de crédito.
 * Un caso pertenece a un cliente y se mueve entre WorkflowStage
 * configurables de la organización.
 */

export interface CaseCreateData {
  clientId: string;
  stageId?: string;
  assignedToId?: string | null;
  summary?: string | null;
  nextReviewAt?: Date | null;
}

export interface CaseUpdateData {
  assignedToId?: string | null;
  summary?: string | null;
}

export interface CaseListFilters {
  stageId?: string;
  state?: CaseState;
  assignedToId?: string;
  reviewFrom?: Date;
  reviewTo?: Date;
  cursor?: string;
  limit?: number;
}

const CASE_LIST_SELECT = {
  id: true,
  caseCode: true,
  state: true,
  openedAt: true,
  nextReviewAt: true,
  closedAt: true,
  summary: true,
  client: { select: { id: true, clientCode: true, firstName: true, lastName: true } },
  stage: { select: { id: true, key: true, name: true, color: true } },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.CreditCaseSelect;

async function assertMember(ctx: OrganizationContext, userId: string) {
  const member = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: ctx.organizationId },
    },
    include: { user: { select: { isActive: true } } },
  });
  if (!member || !member.user.isActive) {
    throw new DomainError("El responsable seleccionado no es un miembro activo de la organización.");
  }
}

async function getCaseOrThrow(ctx: OrganizationContext, caseId: string) {
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    include: { client: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");
  return creditCase;
}

async function getActiveStageOrThrow(ctx: OrganizationContext, stageId: string) {
  const stage = await prisma.workflowStage.findFirst({
    where: { id: stageId, organizationId: ctx.organizationId, isActive: true },
  });
  if (!stage) throw new DomainError("La etapa seleccionada no existe o está inactiva.");
  return stage;
}

/** Primera etapa activa de la organización (por order). */
async function getDefaultStage(ctx: OrganizationContext) {
  const stage = await prisma.workflowStage.findFirst({
    where: { organizationId: ctx.organizationId, isActive: true },
    orderBy: { order: "asc" },
  });
  if (!stage) {
    throw new DomainError("La organización no tiene etapas activas configuradas.");
  }
  return stage;
}

export async function createCreditCase(ctx: OrganizationContext, data: CaseCreateData) {
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, organizationId: ctx.organizationId },
    select: { id: true, status: true, firstName: true, lastName: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");
  if (client.status === "ARCHIVED") {
    throw new DomainError("No se puede crear un caso para un cliente archivado.");
  }
  if (data.assignedToId) await assertMember(ctx, data.assignedToId);
  const stage = data.stageId
    ? await getActiveStageOrThrow(ctx, data.stageId)
    : await getDefaultStage(ctx);

  return prisma.$transaction(async (tx) => {
    const { code } = await nextCaseCode(tx, ctx.organizationId);
    const creditCase = await tx.creditCase.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        caseCode: code,
        stageId: stage.id,
        assignedToId: data.assignedToId ?? null,
        summary: data.summary ?? null,
        nextReviewAt: data.nextReviewAt ?? null,
      },
      include: { stage: { select: { id: true, name: true, color: true } } },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "CREATED",
        description: `Caso ${creditCase.caseCode} creado en etapa "${stage.name}".`,
        clientId: client.id,
        caseId: creditCase.id,
        metadata: { caseCode: creditCase.caseCode, stageKey: stage.key },
      },
      tx,
    );

    return creditCase;
  });
}

export async function updateCreditCase(
  ctx: OrganizationContext,
  caseId: string,
  data: CaseUpdateData,
) {
  const creditCase = await getCaseOrThrow(ctx, caseId);
  if (data.assignedToId) await assertMember(ctx, data.assignedToId);

  return prisma.creditCase.update({
    where: { id: creditCase.id },
    data: {
      ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
      ...(data.summary !== undefined ? { summary: data.summary } : {}),
    },
  });
}

export async function moveCaseToStage(
  ctx: OrganizationContext,
  caseId: string,
  stageId: string,
) {
  const creditCase = await getCaseOrThrow(ctx, caseId);
  const stage = await getActiveStageOrThrow(ctx, stageId);
  if (creditCase.stageId === stage.id) {
    throw new DomainError("El caso ya está en esa etapa.");
  }

  return prisma.$transaction(async (tx) => {
    const fromStage = await tx.workflowStage.findUnique({
      where: { id: creditCase.stageId },
      select: { name: true, key: true },
    });

    const updated = await tx.creditCase.update({
      where: { id: creditCase.id },
      data: { stageId: stage.id },
      include: { stage: { select: { id: true, name: true, color: true } } },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STAGE_CHANGE",
        description: `Caso ${creditCase.caseCode} movido de "${fromStage?.name ?? "?"}" a "${stage.name}".`,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        metadata: { fromStageKey: fromStage?.key, toStageKey: stage.key },
      },
      tx,
    );

    return updated;
  });
}

async function setCaseState(
  ctx: OrganizationContext,
  caseId: string,
  state: CaseState,
  description: string,
) {
  const creditCase = await getCaseOrThrow(ctx, caseId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.creditCase.update({
      where: { id: creditCase.id },
      data: {
        state,
        closedAt: state === "COMPLETED" || state === "CANCELLED" ? new Date() : null,
      },
    });
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STATUS_CHANGE",
        description,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        metadata: { from: creditCase.state, to: state },
      },
      tx,
    );
    return updated;
  });
}

export async function pauseCase(ctx: OrganizationContext, caseId: string) {
  const creditCase = await getCaseOrThrow(ctx, caseId);
  if (creditCase.state !== "OPEN") {
    throw new DomainError("Solo se puede pausar un caso abierto.");
  }
  return setCaseState(ctx, caseId, "PAUSED", `Caso ${creditCase.caseCode} pausado.`);
}

export async function completeCase(ctx: OrganizationContext, caseId: string) {
  const creditCase = await getCaseOrThrow(ctx, caseId);
  if (creditCase.state === "COMPLETED" || creditCase.state === "CANCELLED") {
    throw new DomainError("El caso ya está cerrado.");
  }
  return setCaseState(ctx, caseId, "COMPLETED", `Caso ${creditCase.caseCode} completado.`);
}

export async function cancelCase(ctx: OrganizationContext, caseId: string) {
  const creditCase = await getCaseOrThrow(ctx, caseId);
  if (creditCase.state === "COMPLETED" || creditCase.state === "CANCELLED") {
    throw new DomainError("El caso ya está cerrado.");
  }
  return setCaseState(ctx, caseId, "CANCELLED", `Caso ${creditCase.caseCode} cancelado.`);
}

export async function reopenCase(ctx: OrganizationContext, caseId: string) {
  const creditCase = await getCaseOrThrow(ctx, caseId);
  if (creditCase.state === "OPEN") {
    throw new DomainError("El caso ya está abierto.");
  }
  return setCaseState(ctx, caseId, "OPEN", `Caso ${creditCase.caseCode} reabierto.`);
}

export async function setNextReviewDate(
  ctx: OrganizationContext,
  caseId: string,
  nextReviewAt: Date | null,
) {
  const creditCase = await getCaseOrThrow(ctx, caseId);
  const updated = await prisma.creditCase.update({
    where: { id: creditCase.id },
    data: { nextReviewAt },
  });
  await writeActivityLog(toActivityContext(ctx), {
    type: "NOTE",
    description: nextReviewAt
      ? `Próxima revisión del caso ${creditCase.caseCode} programada.`
      : `Se eliminó la próxima revisión del caso ${creditCase.caseCode}.`,
    clientId: creditCase.clientId,
    caseId: creditCase.id,
    metadata: { nextReviewAt: nextReviewAt?.toISOString() ?? null },
  });
  return updated;
}

export async function listCases(ctx: OrganizationContext, filters: CaseListFilters = {}) {
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Prisma.CreditCaseWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.stageId ? { stageId: filters.stageId } : {}),
    ...(filters.state ? { state: filters.state } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.reviewFrom || filters.reviewTo
      ? {
          nextReviewAt: {
            ...(filters.reviewFrom ? { gte: filters.reviewFrom } : {}),
            ...(filters.reviewTo ? { lte: filters.reviewTo } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.creditCase.findMany({
    where,
    select: CASE_LIST_SELECT,
    orderBy: [{ openedAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

/** Detalle del caso por secciones, sin includes gigantes. */
export async function getCaseDetail(ctx: OrganizationContext, caseId: string) {
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: {
      id: true,
      caseCode: true,
      state: true,
      openedAt: true,
      nextReviewAt: true,
      closedAt: true,
      summary: true,
      createdAt: true,
      client: {
        select: { id: true, clientCode: true, firstName: true, lastName: true, email: true, phone: true },
      },
      stage: { select: { id: true, key: true, name: true, color: true, isTerminal: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const [rounds, openTasks, documents, quotes, payments, timeline] = await Promise.all([
    prisma.creditRound.findMany({
      where: { caseId, organizationId: ctx.organizationId },
      orderBy: { roundNumber: "desc" },
      take: 30,
    }),
    prisma.task.findMany({
      where: { caseId, organizationId: ctx.organizationId, status: { in: ["PENDING", "IN_PROGRESS"] } },
      select: {
        id: true, title: true, type: true, priority: true, status: true, dueAt: true,
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: [{ dueAt: "asc" }],
      take: 30,
    }),
    prisma.document.findMany({
      where: { caseId, organizationId: ctx.organizationId, deletedAt: null },
      select: {
        id: true, category: true, sensitivity: true, originalName: true,
        displayName: true, mimeType: true, sizeBytes: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.quote.findMany({
      where: { caseId, organizationId: ctx.organizationId },
      select: { id: true, folio: true, status: true, total: true, currency: true, issuedAt: true },
      orderBy: { issuedAt: "desc" },
      take: 10,
    }),
    prisma.payment.findMany({
      where: { caseId, organizationId: ctx.organizationId },
      select: {
        id: true, amount: true, currency: true, method: true, status: true,
        dueAt: true, receivedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.activityLog.findMany({
      where: { caseId, organizationId: ctx.organizationId },
      select: {
        id: true, type: true, description: true, createdAt: true,
        actor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return { case: creditCase, rounds, openTasks, documents, quotes, payments, timeline };
}
