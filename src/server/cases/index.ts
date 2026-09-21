import { Prisma } from "@prisma/client";
import type { CaseState, ServiceCaseStatus } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { nextCaseCode } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import { resolveAssigneeForOrg } from "@/src/server/users";
import { ensureCreditRepairService, getServiceByCode } from "@/src/server/services";
import { ensureVerticalService } from "@/src/server/services/verticals";
import type { ServiceCode } from "@/src/server/services/codes";
import { ensureTaskForServiceNextAction } from "@/src/server/automations";

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

/** Fase 5: expediente de cualquier vertical (default CREDIT_REPAIR). */
export interface ServiceCaseCreateData extends CaseCreateData {
  serviceCode?: ServiceCode;
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
  serviceCase: {
    select: {
      id: true,
      nextActionAt: true,
      status: true,
      service: { select: { id: true, name: true } },
    },
  },
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
 * Crea ServiceCase + extensión 1:1 del vertical en la misma transacción.
 * CREDIT_REPAIR → CreditCase; HOME_BUYER → HomeBuyerCase;
 * BUSINESS_CREDIT → FundingCase; PERSONAL_LOAN → PersonalLoanCase;
 * WEB/CRM_DEVELOPMENT → ProjectCase.
 * Si se pasa `tx`, se usa esa transacción (p.ej. markWon): el caller debe
 * haber llamado ensure* y resolveAssignee fuera de la tx.
 */
export async function createServiceCase(
  ctx: OrganizationContext,
  data: ServiceCaseCreateData,
  tx?: Prisma.TransactionClient,
) {
  const serviceCode: ServiceCode = data.serviceCode ?? "CREDIT_REPAIR";

  const run = async (
    client: Prisma.TransactionClient,
    assigneeId: string | null,
    serviceId: string,
  ) => {
    const found = await client.client.findFirst({
      where: { id: data.clientId, organizationId: ctx.organizationId },
      select: { id: true, status: true, firstName: true, lastName: true },
    });
    if (!found) throw new DomainError("Cliente no encontrado.");
    if (found.status === "ARCHIVED") {
      throw new DomainError("No se puede crear un caso para un cliente archivado.");
    }
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

    const foundId = found.id;
    const stageId = stage.id;

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

    // Extensión 1:1 del vertical (D2 / D9).
    let creditCase: Awaited<ReturnType<typeof createCreditExtension>> | null =
      null;

    async function createCreditExtension() {
      return client.creditCase.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: foundId,
          serviceCaseId: serviceCase.id,
          caseCode: code,
          stageId: stageId,
          assignedToId: assigneeId,
          summary: data.summary ?? null,
        },
        include: { stage: { select: { id: true, name: true, color: true } } },
      });
    }

    switch (serviceCode) {
      case "CREDIT_REPAIR":
        creditCase = await createCreditExtension();
        break;
      case "HOME_BUYER":
        await client.homeBuyerCase.create({
          data: {
            organizationId: ctx.organizationId,
            serviceCaseId: serviceCase.id,
            summary: data.summary ?? null,
          },
        });
        break;
      case "BUSINESS_CREDIT":
        await client.fundingCase.create({
          data: {
            organizationId: ctx.organizationId,
            serviceCaseId: serviceCase.id,
            summary: data.summary ?? null,
          },
        });
        break;
      case "PERSONAL_LOAN":
        await client.personalLoanCase.create({
          data: {
            organizationId: ctx.organizationId,
            serviceCaseId: serviceCase.id,
            summary: data.summary ?? null,
          },
        });
        break;
      case "WEB_DEVELOPMENT":
      case "CRM_DEVELOPMENT":
        await client.projectCase.create({
          data: {
            organizationId: ctx.organizationId,
            serviceCaseId: serviceCase.id,
            scopeSummary: data.summary ?? null,
          },
        });
        break;
      default:
        throw new DomainError(`Vertical no soportada: ${serviceCode}`);
    }

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "CREATED",
        description: `Expediente ${code} creado en etapa "${stage.name}".`,
        clientId: found.id,
        caseId: creditCase?.id ?? null,
        serviceCaseId: serviceCase.id,
        metadata: {
          caseCode: creditCase?.caseCode ?? code,
          caseNumber: serviceCase.caseNumber,
          stageKey: stage.key,
          serviceCaseId: serviceCase.id,
          serviceId,
          serviceCode,
          status: "OPEN",
        },
      },
      client,
    );

    return { serviceCase, creditCase };
  };

  if (tx) {
    const existing = await getServiceByCode(ctx.organizationId, serviceCode, tx);
    if (!existing) {
      throw new DomainError("La organización no tiene el servicio configurado.");
    }
    return run(tx, data.assignedToId ?? null, existing.id);
  }

  const assigneeId = await resolveAssigneeForOrg(
    ctx.organizationId,
    data.assignedToId,
  );
  const catalog =
    serviceCode === "CREDIT_REPAIR"
      ? await ensureCreditRepairService(ctx.organizationId)
      : await ensureVerticalService(ctx.organizationId, serviceCode);
  return prisma.$transaction((client) => run(client, assigneeId, catalog.id));
}

/**
 * Crear expediente CREDIT_REPAIR = ServiceCase + CreditCase 1:1 (wrap, D9).
 * Devuelve el CreditCase (contrato histórico de la UI y los smokes).
 */
export async function createCreditCase(
  ctx: OrganizationContext,
  data: CaseCreateData,
  tx?: Prisma.TransactionClient,
) {
  const result = await createServiceCase(
    ctx,
    { ...data, serviceCode: "CREDIT_REPAIR" },
    tx,
  );
  if (!result.creditCase) {
    throw new DomainError("No se creó el CreditCase del expediente de crédito.");
  }
  return result.creditCase;
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

    // Siguiente acción sugerida (asignada al usuario actual).
    const { suggestedTaskTitleForStage } = await import(
      "@/src/lib/case-section-visibility"
    );
    const assigneeId =
      ctx.userId ??
      creditCase.assignedToId ??
      serviceCase.assignedToId ??
      null;
    let suggestedTaskId: string | null = null;
    if (assigneeId) {
      const title = suggestedTaskTitleForStage(stage.name, stage.key);
      const task = await tx.task.create({
        data: {
          organizationId: ctx.organizationId,
          title,
          type: "FOLLOW_UP",
          priority: "NORMAL",
          status: "PENDING",
          assignedToId: assigneeId,
          createdById: ctx.userId,
          clientId: creditCase.clientId,
          caseId: creditCase.id,
          serviceCaseId: serviceCase.id,
          dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
      });
      suggestedTaskId = task.id;
    }

    return { ...updated, suggestedTaskId };
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
  }).then(async (result) => {
    try {
      await ensureTaskForServiceNextAction(ctx, result.serviceCaseId);
    } catch (error) {
      console.error("[cases] ensureTaskForServiceNextAction:", error);
    }
    return result;
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
          serviceCase: {
            nextActionAt: {
              ...(filters.reviewFrom ? { gte: filters.reviewFrom } : {}),
              ...(filters.reviewTo ? { lte: filters.reviewTo } : {}),
            },
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
          service: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const isCreditRepair =
    creditCase.serviceCase.service?.code === "CREDIT_REPAIR" ||
    creditCase.serviceCase.service?.name === "Credit Repair";

  const [rounds, openTasks, documents, quotes, payments, timeline, stageHistory, notes, paymentsReceived, paymentsPending, latestCreditReport] =
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
      isCreditRepair
        ? prisma.creditReport.findFirst({
            where: { caseId, organizationId: ctx.organizationId },
            orderBy: { reportDate: "desc" },
            select: {
              id: true,
              reportDate: true,
              type: true,
              snapshots: {
                select: { bureau: true, score: true },
                orderBy: { bureau: "asc" },
              },
            },
          })
        : Promise.resolve(null),
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

  const activeRound =
    rounds.find((r) =>
      ["DRAFT", "PREPARING", "SENT", "WAITING_UPDATE", "REVIEWING"].includes(
        r.status,
      ),
    ) ?? rounds[0] ?? null;

  const creditSnapshot = isCreditRepair
    ? {
        report: latestCreditReport,
        scores:
          latestCreditReport?.snapshots.map((s) => ({
            bureau: s.bureau,
            score: s.score,
          })) ?? [],
        activeRound: activeRound
          ? {
              id: activeRound.id,
              roundNumber: activeRound.roundNumber,
              status: activeRound.status,
              sentAt: activeRound.sentAt,
              expectedReviewAt: activeRound.expectedReviewAt,
            }
          : null,
      }
    : null;

  return {
    case: creditCase,
    isCreditRepair,
    creditSnapshot,
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
