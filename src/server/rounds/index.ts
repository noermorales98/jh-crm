import type { Prisma, RoundStatus } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";

/**
 * Servicio de rondas de disputa. Numeración por caso con
 * @@unique([caseId, roundNumber]): el número se calcula (max + 1)
 * dentro de la transacción.
 */

export interface RoundCreateData {
  caseId: string;
  notes?: string | null;
  lettersCount?: number;
  disputedItemsCount?: number;
}

export interface RoundUpdateData {
  notes?: string | null;
  lettersCount?: number;
  disputedItemsCount?: number;
}

export interface MarkRoundSentData {
  /** Fecha acordada de revisión (obligatoria al enviar). */
  expectedReviewAt: Date;
  /** Si true, crea una Task type CREDIT_UPDATE con dueAt = expectedReviewAt. */
  createReviewTask?: boolean;
  /** Responsable de la tarea (default: responsable del caso, si existe). */
  assignedToId?: string;
  /** Recordatorio de la tarea (default: expectedReviewAt). */
  reminderAt?: Date;
}

export type RoundReviewOutcome = "COMPLETED" | "REVIEWING";

export interface RoundListFilters {
  status?: RoundStatus;
  caseId?: string;
  /** Solo rondas con expectedReviewAt dentro de los próximos N días (o vencidas). */
  upcomingDays?: number;
  cursor?: string;
  limit?: number;
}

const ROUND_LIST_SELECT = {
  id: true,
  roundNumber: true,
  status: true,
  startedAt: true,
  sentAt: true,
  expectedReviewAt: true,
  reviewedAt: true,
  lettersCount: true,
  disputedItemsCount: true,
  case: {
    select: {
      id: true,
      caseCode: true,
      client: { select: { id: true, clientCode: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.CreditRoundSelect;

async function getCaseInOrg(ctx: OrganizationContext, caseId: string) {
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");
  return creditCase;
}

async function getRoundOrThrow(ctx: OrganizationContext, roundId: string) {
  const round = await prisma.creditRound.findFirst({
    where: { id: roundId, organizationId: ctx.organizationId },
    include: { case: { select: { id: true, caseCode: true, clientId: true, assignedToId: true } } },
  });
  if (!round) throw new DomainError("Ronda no encontrada.");
  return round;
}

function assertRoundStatus(round: { status: RoundStatus }, allowed: RoundStatus[], message: string) {
  if (!allowed.includes(round.status)) {
    throw new DomainError(message);
  }
}

export async function createRound(ctx: OrganizationContext, data: RoundCreateData) {
  const creditCase = await getCaseInOrg(ctx, data.caseId);
  if (creditCase.state !== "OPEN") {
    throw new DomainError("Solo se pueden crear rondas en casos abiertos.");
  }

  return prisma.$transaction(async (tx) => {
    const last = await tx.creditRound.findFirst({
      where: { caseId: creditCase.id },
      orderBy: { roundNumber: "desc" },
      select: { roundNumber: true },
    });
    const roundNumber = (last?.roundNumber ?? 0) + 1;

    const round = await tx.creditRound.create({
      data: {
        organizationId: ctx.organizationId,
        caseId: creditCase.id,
        roundNumber,
        notes: data.notes ?? null,
        lettersCount: data.lettersCount ?? 0,
        disputedItemsCount: data.disputedItemsCount ?? 0,
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "ROUND_CREATED",
        description: `Ronda ${roundNumber} creada para el caso ${creditCase.caseCode}.`,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        roundId: round.id,
        metadata: { roundNumber },
      },
      tx,
    );

    return round;
  });
}

export async function updateRound(
  ctx: OrganizationContext,
  roundId: string,
  data: RoundUpdateData,
) {
  const round = await getRoundOrThrow(ctx, roundId);
  assertRoundStatus(
    round,
    ["DRAFT", "PREPARING"],
    "Solo se pueden editar rondas en borrador o preparación.",
  );
  return prisma.creditRound.update({
    where: { id: round.id },
    data: {
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.lettersCount !== undefined ? { lettersCount: data.lettersCount } : {}),
      ...(data.disputedItemsCount !== undefined
        ? { disputedItemsCount: data.disputedItemsCount }
        : {}),
    },
  });
}

/**
 * Marca la ronda como enviada. En una sola transacción:
 *   ronda → SENT + sentAt + expectedReviewAt
 *   opcional: Task(type=CREDIT_UPDATE) con dueAt=expectedReviewAt
 *   ActivityLog ROUND_SENT
 */
export async function markRoundSent(
  ctx: OrganizationContext,
  roundId: string,
  data: MarkRoundSentData,
) {
  const round = await getRoundOrThrow(ctx, roundId);
  assertRoundStatus(
    round,
    ["DRAFT", "PREPARING"],
    "Solo se puede enviar una ronda en borrador o preparación.",
  );
  if (!data.expectedReviewAt) {
    throw new DomainError("Debes indicar la fecha esperada de revisión.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.creditRound.update({
      where: { id: round.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        expectedReviewAt: data.expectedReviewAt,
      },
    });

    let reviewTask = null;
    if (data.createReviewTask) {
      const assignee = data.assignedToId ?? round.case.assignedToId ?? ctx.userId;
      reviewTask = await tx.task.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: round.case.clientId,
          caseId: round.caseId,
          roundId: round.id,
          title: `Revisar actualización de la ronda ${round.roundNumber} (${round.case.caseCode})`,
          type: "CREDIT_UPDATE",
          priority: "NORMAL",
          dueAt: data.expectedReviewAt,
          reminderAt: data.reminderAt ?? data.expectedReviewAt,
          assignedToId: assignee,
          createdById: ctx.userId,
        },
      });
    }

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "ROUND_SENT",
        description: `Ronda ${round.roundNumber} del caso ${round.case.caseCode} marcada como enviada.`,
        clientId: round.case.clientId,
        caseId: round.caseId,
        roundId: round.id,
        metadata: {
          roundNumber: round.roundNumber,
          expectedReviewAt: data.expectedReviewAt.toISOString(),
          reviewTaskId: reviewTask?.id ?? null,
        },
      },
      tx,
    );

    return { round: updated, reviewTask };
  });
}

/**
 * Registra la revisión de una ronda enviada.
 * outcome=COMPLETED: la ronda queda cerrada (reviewedAt).
 * outcome=REVIEWING: hay respuesta del buró pero sigue en análisis
 * (reviewedAt se registra y el status pasa a REVIEWING).
 */
export async function markRoundReviewed(
  ctx: OrganizationContext,
  roundId: string,
  data: { outcome?: RoundReviewOutcome; notes?: string | null } = {},
) {
  const round = await getRoundOrThrow(ctx, roundId);
  assertRoundStatus(
    round,
    ["SENT", "WAITING_UPDATE", "REVIEWING"],
    "Solo se puede revisar una ronda enviada o en espera de actualización.",
  );
  const outcome: RoundReviewOutcome = data.outcome ?? "COMPLETED";

  return prisma.$transaction(async (tx) => {
    const updated = await tx.creditRound.update({
      where: { id: round.id },
      data: {
        status: outcome,
        reviewedAt: new Date(),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "ROUND_REVIEWED",
        description:
          outcome === "COMPLETED"
            ? `Ronda ${round.roundNumber} del caso ${round.case.caseCode} revisada y completada.`
            : `Ronda ${round.roundNumber} del caso ${round.case.caseCode} en revisión.`,
        clientId: round.case.clientId,
        caseId: round.caseId,
        roundId: round.id,
        metadata: { roundNumber: round.roundNumber, outcome },
      },
      tx,
    );

    return updated;
  });
}

export async function cancelRound(ctx: OrganizationContext, roundId: string) {
  const round = await getRoundOrThrow(ctx, roundId);
  assertRoundStatus(
    round,
    ["DRAFT", "PREPARING", "SENT", "WAITING_UPDATE", "REVIEWING"],
    "No se puede cancelar una ronda completada.",
  );

  return prisma.$transaction(async (tx) => {
    const updated = await tx.creditRound.update({
      where: { id: round.id },
      data: { status: "CANCELLED" },
    });
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STATUS_CHANGE",
        description: `Ronda ${round.roundNumber} del caso ${round.case.caseCode} cancelada.`,
        clientId: round.case.clientId,
        caseId: round.caseId,
        roundId: round.id,
        metadata: { roundNumber: round.roundNumber },
      },
      tx,
    );
    return updated;
  });
}

/** Vista global de rondas (/rondas), con filtro de próximas revisiones. */
export async function listRounds(ctx: OrganizationContext, filters: RoundListFilters = {}) {
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Prisma.CreditRoundWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.caseId ? { caseId: filters.caseId } : {}),
    ...(filters.upcomingDays !== undefined
      ? {
          expectedReviewAt: {
            lte: new Date(Date.now() + filters.upcomingDays * 24 * 60 * 60 * 1000),
          },
          status: filters.status ?? { in: ["SENT", "WAITING_UPDATE", "REVIEWING"] },
        }
      : {}),
  };

  const rows = await prisma.creditRound.findMany({
    where,
    select: ROUND_LIST_SELECT,
    orderBy: [{ expectedReviewAt: "asc" }, { id: "asc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
