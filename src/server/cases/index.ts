import { Prisma } from "@prisma/client";
import type { CaseState, ServiceCaseStatus } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { nextCaseCode } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import { resolveAssigneeForOrg } from "@/src/server/users";
import { ensureCreditRepairService } from "@/src/server/services";

/**
 * Crear expediente = ServiceCase + CreditCase 1:1 (CREDIT_REPAIR).
 * SC-001: clientId + serviceId + caseNumber + OPEN + stageId inicial + Activity.
 * Las pantallas de crédito siguen leyendo por CreditCase.id.
 */

export interface CaseCreateData {
  clientId: string;
  stageId?: string;
  assignedToId?: string | null;
  summary?: string | null;
  nextActionAt?: Date | null;
  /** @deprecated Compatibilidad de llamadas internas previas a SC-003. */
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
  serviceCaseId: true,
  state: true,
  openedAt: true,
  nextReviewAt: true,
  closedAt: true,
  summary: true,
  client: { select: { id: true, clientCode: true, firstName: true, lastName: true } },
  stage: { select: { id: true, key: true, name: true, color: true } },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.CreditCaseSelect;

function mapCaseStateToServiceStatus(state: CaseState): ServiceCaseStatus {
  switch (state) {
    case "PAUSED":
      return "ON_HOLD";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELED";
    default:
      return "OPEN";
  }
}

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

async function getCreditRepairServiceId(
  organizationId: string,
  tx?: Prisma.TransactionClient,
) {
  const service = await ensureCreditRepairService(organizationId, tx);
  return service.id;
}

async function getActiveStageOrThrow(
  ctx: OrganizationContext,
  stageId: string,
  serviceId: string,
) {
  const stage = await prisma.workflowStage.findFirst({
    where: {
      id: stageId,
      organizationId: ctx.organizationId,
      serviceId,
      isActive: true,
    },
  });
  if (!stage) {
    throw new DomainError("La etapa seleccionada no existe o está inactiva.");
  }
  return stage;
}

/**
 * Crea ServiceCase + CreditCase en la misma transacción.
 * Si se pasa `tx`, se usa esa transacción (p.ej. markWon).
 */
export async function createCreditCase(
  ctx: OrganizationContext,
  data: CaseCreateData,
  tx?: Prisma.TransactionClient,
) {
  const run = async (client: Prisma.TransactionClient) => {
    const found = await client.client.findFirst({
      where: { id: data.clientId, organizationId: ctx.organizationId },
      select: { id: true, status: true, firstName: true, lastName: true },
    });
    if (!found) throw new DomainError("Cliente no encontrado.");
    if (found.status === "ARCHIVED") {
      throw new DomainError("No se puede crear un caso para un cliente archivado.");
    }
    const assigneeId = await resolveAssigneeForOrg(
      ctx.organizationId,
      data.assignedToId,
    );
    if (assigneeId) {
      const member = await client.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId: assigneeId,
            organizationId: ctx.organizationId,
          },
        },
        include: { user: { select: { isActive: true } } },
      });
      if (!member || !member.user.isActive) {
        throw new DomainError(
          "El responsable seleccionado no es un miembro activo de la organización.",
        );
      }
    }

    const serviceId = await getCreditRepairServiceId(ctx.organizationId, client);
    const stage = data.stageId
      ? await client.workflowStage.findFirst({
          where: {
            id: data.stageId,
            organizationId: ctx.organizationId,
            serviceId,
            isActive: true,
          },
        })
      : await client.workflowStage.findFirst({
          where: {
            organizationId: ctx.organizationId,
            serviceId,
            isActive: true,
          },
          orderBy: { order: "asc" },
        });
    if (!stage) {
      throw new DomainError(
        data.stageId
          ? "La etapa seleccionada no existe o está inactiva."
          : "La organización no tiene etapas activas configuradas.",
      );
    }

    const { code } = await nextCaseCode(client, ctx.organizationId);
    const nextActionAt = data.nextActionAt ?? data.nextReviewAt ?? null;

    const serviceCase = await client.serviceCase.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: found.id,
        serviceId,
        caseNumber: code,
        status: "OPEN",
        stageId: stage.id,
        assignedToId: assigneeId,
        nextActionAt,
      },
    });

    // SC-001: apertura documentada (fromStageId null → etapa inicial).
    await client.serviceCaseStageHistory.create({
      data: {
        serviceCaseId: serviceCase.id,
        fromStageId: null,
        toStageId: stage.id,
        changedById: ctx.userId ?? null,
      },
    });

    const creditCase = await client.creditCase.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: found.id,
        serviceCaseId: serviceCase.id,
        caseCode: code,
        stageId: stage.id,
        assignedToId: assigneeId,
        summary: data.summary ?? null,
      },
      include: { stage: { select: { id: true, name: true, color: true } } },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "CREATED",
        description: `Expediente ${creditCase.caseCode} creado en etapa "${stage.name}".`,
        clientId: found.id,
        caseId: creditCase.id,
        serviceCaseId: serviceCase.id,
        metadata: {
          caseCode: creditCase.caseCode,
          caseNumber: serviceCase.caseNumber,
          stageKey: stage.key,
          serviceCaseId: serviceCase.id,
          serviceId,
          serviceCode: "CREDIT_REPAIR",
          status: "OPEN",
        },
      },
      client,
    );

    return creditCase;
  };

  if (tx) return run(tx);
  return prisma.$transaction((client) => run(client));
}

export async function updateCreditCase(
  ctx: OrganizationContext,
  caseId: string,
  data: CaseUpdateData,
) {
  const creditCase = await getCaseOrThrow(ctx, caseId);
  if (data.assignedToId) await assertMember(ctx, data.assignedToId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.creditCase.update({
      where: { id: creditCase.id },
      data: {
        ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
        ...(data.summary !== undefined ? { summary: data.summary } : {}),
      },
    });
    if (data.assignedToId !== undefined) {
      await tx.serviceCase.update({
        where: { id: creditCase.serviceCaseId },
        data: { assignedToId: data.assignedToId },
      });
    }
    return updated;
  });
}

export interface CaseAmountsData {
  quotedAmount?: Prisma.Decimal | number | string | null;
  agreedAmount?: Prisma.Decimal | number | string | null;
}

/**
 * PY-002 / Fase 4 — montos del expediente (fuente del balance de ServiceCase).
 * Escribe solo en ServiceCase; CreditCase no guarda dinero.
 */
export async function updateCaseAmounts(
  ctx: OrganizationContext,
  caseId: string,
  data: CaseAmountsData,
) {
  const creditCase = await getCaseOrThrow(ctx, caseId);

  const toMoney = (v: Prisma.Decimal | number | string | null | undefined) =>
    v === undefined
      ? undefined
      : v === null
        ? null
        : new Prisma.Decimal(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const quoted = toMoney(data.quotedAmount);
  const agreed = toMoney(data.agreedAmount);
  for (const [label, value] of [
    ["cotizado", quoted],
    ["acordado", agreed],
  ] as const) {
    if (value && value.lt(0)) {
      throw new DomainError(`El monto ${label} no puede ser negativo.`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const serviceCase = await tx.serviceCase.update({
      where: { id: creditCase.serviceCaseId },
      data: {
        ...(quoted !== undefined ? { quotedAmount: quoted } : {}),
        ...(agreed !== undefined ? { agreedAmount: agreed } : {}),
      },
      select: { id: true, quotedAmount: true, agreedAmount: true },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "NOTE",
        description: `Montos del expediente ${creditCase.caseCode} actualizados (cotizado: ${serviceCase.quotedAmount?.toString() ?? "—"}, acordado: ${serviceCase.agreedAmount?.toString() ?? "—"}).`,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        serviceCaseId: creditCase.serviceCaseId,
        metadata: {
          quotedAmount: serviceCase.quotedAmount?.toString() ?? null,
          agreedAmount: serviceCase.agreedAmount?.toString() ?? null,
        },
      },
      tx,
    );

    return { id: creditCase.id, clientId: creditCase.clientId, serviceCase };
  });
}

export async function moveCaseToStage(
  ctx: OrganizationContext,
  caseId: string,
  stageId: string,
) {
  const creditCase = await getCaseOrThrow(ctx, caseId);
  if (creditCase.state === "COMPLETED" || creditCase.state === "CANCELLED") {
    throw new DomainError("No se puede cambiar la etapa de un caso cerrado.");
  }

  const serviceCase = await prisma.serviceCase.findFirst({
    where: { id: creditCase.serviceCaseId, organizationId: ctx.organizationId },
  });
  if (!serviceCase) throw new DomainError("Expediente ServiceCase no encontrado.");
  if (serviceCase.status === "COMPLETED" || serviceCase.status === "CANCELED") {
    throw new DomainError("No se puede cambiar la etapa de un expediente cerrado.");
  }

  const stage = await getActiveStageOrThrow(ctx, stageId, serviceCase.serviceId);
  if (stage.serviceId !== serviceCase.serviceId) {
    throw new DomainError("La etapa no pertenece al servicio del expediente.");
  }

  // BR-005 / SC-002: stageId canónico en ServiceCase (no string paralelo).
  const fromStageId = serviceCase.stageId;
  if (fromStageId === stage.id) {
    throw new DomainError("El expediente ya está en esa etapa.");
  }

  return prisma.$transaction(async (tx) => {
    const fromStage = await tx.workflowStage.findUnique({
      where: { id: fromStageId },
      select: { id: true, name: true, key: true },
    });

    const updated = await tx.creditCase.update({
      where: { id: creditCase.id },
      data: { stageId: stage.id },
      include: { stage: { select: { id: true, name: true, color: true } } },
    });

    // Solo stageId FK — nunca un campo string `stage` en ServiceCase.
    await tx.serviceCase.update({
      where: { id: serviceCase.id },
      data: { stageId: stage.id },
    });

    await tx.serviceCaseStageHistory.create({
      data: {
        serviceCaseId: serviceCase.id,
        fromStageId,
        toStageId: stage.id,
        changedById: ctx.userId ?? null,
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STAGE_CHANGE",
        description: `Expediente ${creditCase.caseCode} movido de "${fromStage?.name ?? "?"}" a "${stage.name}".`,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        serviceCaseId: serviceCase.id,
        metadata: {
          fromStageId,
          toStageId: stage.id,
          fromStageKey: fromStage?.key ?? null,
          toStageKey: stage.key,
          actorId: ctx.userId,
        },
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
  const serviceStatus = mapCaseStateToServiceStatus(state);
  const closed =
    state === "COMPLETED" || state === "CANCELLED" ? new Date() : null;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.creditCase.update({
      where: { id: creditCase.id },
      data: {
        state,
        closedAt: closed,
      },
    });
    await tx.serviceCase.update({
      where: { id: creditCase.serviceCaseId },
      data: {
        status: serviceStatus,
        completedAt: closed,
      },
    });
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STATUS_CHANGE",
        description,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        serviceCaseId: creditCase.serviceCaseId,
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

/** SC-003: actualiza solamente la fuente operativa canónica. */
export async function setNextActionAt(
  ctx: OrganizationContext,
  caseId: string,
  nextActionAt: Date | null,
) {
  const creditCase = await getCaseOrThrow(ctx, caseId);
  return prisma.$transaction(async (tx) => {
    const serviceCase = await tx.serviceCase.update({
      where: { id: creditCase.serviceCaseId },
      data: { nextActionAt },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "NOTE",
        description: nextActionAt
          ? `Próxima acción del expediente ${creditCase.caseCode} programada.`
          : `Se eliminó la próxima acción del expediente ${creditCase.caseCode}.`,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        serviceCaseId: creditCase.serviceCaseId,
        metadata: { nextActionAt: nextActionAt?.toISOString() ?? null },
      },
      tx,
    );

    return {
      id: creditCase.id,
      clientId: creditCase.clientId,
      serviceCaseId: serviceCase.id,
      nextActionAt: serviceCase.nextActionAt,
    };
  });
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
      serviceCaseId: true,
      state: true,
      openedAt: true,
      closedAt: true,
      summary: true,
      createdAt: true,
      client: {
        select: { id: true, clientCode: true, firstName: true, lastName: true, email: true, phone: true },
      },
      stage: { select: { id: true, key: true, name: true, color: true, isTerminal: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      serviceCase: {
        select: {
          id: true,
          serviceId: true,
          stageId: true,
          status: true,
          nextActionAt: true,
          quotedAmount: true,
          agreedAmount: true,
        },
      },
    },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const [rounds, openTasks, documents, quotes, payments, timeline, stageHistory, notes, paymentsReceived, paymentsPending] =
    await Promise.all([
      prisma.creditRound.findMany({
        where: { caseId, organizationId: ctx.organizationId },
        orderBy: { roundNumber: "desc" },
        take: 30,
      }),
      prisma.task.findMany({
        where: {
          caseId,
          organizationId: ctx.organizationId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        select: {
          id: true,
          title: true,
          type: true,
          priority: true,
          status: true,
          dueAt: true,
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: [{ dueAt: "asc" }],
        take: 30,
      }),
      prisma.document.findMany({
        where: {
          caseId,
          organizationId: ctx.organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          category: true,
          sensitivity: true,
          originalName: true,
          displayName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.quote.findMany({
        where: { caseId, organizationId: ctx.organizationId },
        select: {
          id: true,
          folio: true,
          status: true,
          total: true,
          currency: true,
          issuedAt: true,
        },
        orderBy: { issuedAt: "desc" },
        take: 10,
      }),
      prisma.payment.findMany({
        where: { caseId, organizationId: ctx.organizationId },
        select: {
          id: true,
          amount: true,
          currency: true,
          method: true,
          status: true,
          dueAt: true,
          receivedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.activityLog.findMany({
        where: { caseId, organizationId: ctx.organizationId },
        select: {
          id: true,
          type: true,
          description: true,
          createdAt: true,
          actor: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.serviceCaseStageHistory.findMany({
        where: { serviceCaseId: creditCase.serviceCaseId },
        select: {
          id: true,
          changedAt: true,
          fromStage: { select: { id: true, name: true, color: true } },
          toStage: { select: { id: true, name: true, color: true } },
          changedBy: { select: { id: true, name: true } },
        },
        orderBy: { changedAt: "desc" },
        take: 15,
      }),
      // NT-001: notas humanas del expediente (tabla Note, no ActivityLog).
      prisma.note.findMany({
        where: {
          organizationId: ctx.organizationId,
          serviceCaseId: creditCase.serviceCaseId,
        },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      // PY-002 / Fase 4: balance del expediente (agreedAmount − RECEIVED).
      prisma.payment.aggregate({
        where: {
          organizationId: ctx.organizationId,
          serviceCaseId: creditCase.serviceCaseId,
          status: "RECEIVED",
        },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          organizationId: ctx.organizationId,
          serviceCaseId: creditCase.serviceCaseId,
          status: "PENDING",
        },
        _sum: { amount: true },
      }),
    ]);

  const agreed = creditCase.serviceCase.agreedAmount;
  const paid = paymentsReceived._sum.amount ?? new Prisma.Decimal(0);
  const caseBalance = {
    currency: "USD",
    quotedAmount: creditCase.serviceCase.quotedAmount,
    agreedAmount: agreed,
    paid,
    pending: paymentsPending._sum.amount ?? new Prisma.Decimal(0),
    balance: agreed ? agreed.sub(paid) : null,
  };

  return {
    case: creditCase,
    rounds,
    openTasks,
    documents,
    quotes,
    payments,
    timeline,
    stageHistory,
    notes,
    caseBalance,
  };
}
