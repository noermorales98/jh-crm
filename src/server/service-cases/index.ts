import { Prisma, type ServiceCaseStatus } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import { serviceCaseBalance } from "@/src/server/payments";
import { ensureTaskForServiceNextAction } from "@/src/server/automations";

/**
 * Fase 5 — Operaciones directas sobre ServiceCase (expediente genérico).
 *
 * Las operaciones de crédito (src/server/cases) siguen resolviendo el
 * ServiceCase a través del CreditCase. Estas funciones atienden los
 * verticales sin CreditCase (HOME_BUYER, BUSINESS_CREDIT, PERSONAL_LOAN,
 * WEB/CRM_DEVELOPMENT) y escriben lo mismo: ServiceCase canónico +
 * StageHistory + Activity; si existe CreditCase se refleja el cambio
 * (stageId / state) para no romper la paridad del wrap.
 */

export async function getServiceCaseOrThrow(
  ctx: OrganizationContext,
  serviceCaseId: string,
) {
  const serviceCase = await prisma.serviceCase.findFirst({
    where: { id: serviceCaseId, organizationId: ctx.organizationId },
    include: {
      client: {
        select: { id: true, clientCode: true, firstName: true, lastName: true },
      },
      service: { select: { id: true, code: true, name: true } },
      stage: { select: { id: true, key: true, name: true, color: true } },
      creditCase: { select: { id: true, caseCode: true, state: true } },
    },
  });
  if (!serviceCase) throw new DomainError("Expediente no encontrado.");
  return serviceCase;
}

const STATUS_TO_CASE_STATE: Record<ServiceCaseStatus, string | null> = {
  OPEN: "OPEN",
  ON_HOLD: "PAUSED",
  COMPLETED: "COMPLETED",
  CANCELED: "CANCELLED",
};

export async function moveServiceCaseToStage(
  ctx: OrganizationContext,
  serviceCaseId: string,
  stageId: string,
) {
  const serviceCase = await getServiceCaseOrThrow(ctx, serviceCaseId);
  if (serviceCase.status === "COMPLETED" || serviceCase.status === "CANCELED") {
    throw new DomainError("No se puede cambiar la etapa de un expediente cerrado.");
  }

  const stage = await prisma.workflowStage.findFirst({
    where: {
      id: stageId,
      organizationId: ctx.organizationId,
      serviceId: serviceCase.serviceId,
      isActive: true,
    },
  });
  if (!stage) {
    throw new DomainError("La etapa seleccionada no existe o está inactiva.");
  }

  const fromStageId = serviceCase.stageId;
  if (fromStageId === stage.id) {
    throw new DomainError("El expediente ya está en esa etapa.");
  }

  return prisma.$transaction(async (tx) => {
    const fromStage = await tx.workflowStage.findUnique({
      where: { id: fromStageId },
      select: { id: true, name: true, key: true },
    });

    const updated = await tx.serviceCase.update({
      where: { id: serviceCase.id },
      data: { stageId: stage.id },
    });

    // Paridad del wrap: el CreditCase espeja el stage si existe.
    if (serviceCase.creditCase) {
      await tx.creditCase.update({
        where: { id: serviceCase.creditCase.id },
        data: { stageId: stage.id },
      });
    }

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
        description: `Expediente ${serviceCase.caseNumber} movido de "${fromStage?.name ?? "?"}" a "${stage.name}".`,
        clientId: serviceCase.clientId,
        caseId: serviceCase.creditCase?.id ?? null,
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

export async function setServiceCaseNextActionAt(
  ctx: OrganizationContext,
  serviceCaseId: string,
  nextActionAt: Date | null,
) {
  const serviceCase = await getServiceCaseOrThrow(ctx, serviceCaseId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.serviceCase.update({
      where: { id: serviceCase.id },
      data: { nextActionAt },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "NOTE",
        description: nextActionAt
          ? `Próxima acción del expediente ${serviceCase.caseNumber} programada.`
          : `Se eliminó la próxima acción del expediente ${serviceCase.caseNumber}.`,
        clientId: serviceCase.clientId,
        caseId: serviceCase.creditCase?.id ?? null,
        serviceCaseId: serviceCase.id,
        metadata: { nextActionAt: nextActionAt?.toISOString() ?? null },
      },
      tx,
    );

    return updated;
  }).then(async (updated) => {
    try {
      await ensureTaskForServiceNextAction(ctx, updated.id);
    } catch (error) {
      console.error("[service-cases] ensureTaskForServiceNextAction:", error);
    }
    return updated;
  });
}

export async function transitionServiceCase(
  ctx: OrganizationContext,
  serviceCaseId: string,
  target: ServiceCaseStatus,
) {
  const serviceCase = await getServiceCaseOrThrow(ctx, serviceCaseId);
  const closed =
    target === "COMPLETED" || target === "CANCELED" ? new Date() : null;

  const labels: Record<ServiceCaseStatus, string> = {
    OPEN: "reabierto",
    ON_HOLD: "pausado",
    COMPLETED: "completado",
    CANCELED: "cancelado",
  };

  return prisma.$transaction(async (tx) => {
    const updated = await tx.serviceCase.update({
      where: { id: serviceCase.id },
      data: { status: target, completedAt: closed },
    });

    if (serviceCase.creditCase) {
      const caseState = STATUS_TO_CASE_STATE[target];
      if (caseState) {
        await tx.creditCase.update({
          where: { id: serviceCase.creditCase.id },
          data: {
            state: caseState as never,
            closedAt: closed,
          },
        });
      }
    }

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STATUS_CHANGE",
        description: `Expediente ${serviceCase.caseNumber} ${labels[target]}.`,
        clientId: serviceCase.clientId,
        caseId: serviceCase.creditCase?.id ?? null,
        serviceCaseId: serviceCase.id,
        metadata: { from: serviceCase.status, to: target },
      },
      tx,
    );

    return updated;
  });
}

/** PY-002 — montos del expediente por serviceCaseId (sin pasar por CreditCase). */
export async function updateServiceCaseAmounts(
  ctx: OrganizationContext,
  serviceCaseId: string,
  data: {
    quotedAmount?: Prisma.Decimal | number | string | null;
    agreedAmount?: Prisma.Decimal | number | string | null;
  },
) {
  const serviceCase = await getServiceCaseOrThrow(ctx, serviceCaseId);

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
    const updated = await tx.serviceCase.update({
      where: { id: serviceCase.id },
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
        description: `Montos del expediente ${serviceCase.caseNumber} actualizados (cotizado: ${updated.quotedAmount?.toString() ?? "—"}, acordado: ${updated.agreedAmount?.toString() ?? "—"}).`,
        clientId: serviceCase.clientId,
        caseId: serviceCase.creditCase?.id ?? null,
        serviceCaseId: serviceCase.id,
        metadata: {
          quotedAmount: updated.quotedAmount?.toString() ?? null,
          agreedAmount: updated.agreedAmount?.toString() ?? null,
        },
      },
      tx,
    );

    return updated;
  });
}

/** Detalle del expediente genérico (vertical sin CreditCase). */
export async function getServiceCaseDetail(
  ctx: OrganizationContext,
  serviceCaseId: string,
) {
  const serviceCase = await prisma.serviceCase.findFirst({
    where: { id: serviceCaseId, organizationId: ctx.organizationId },
    select: {
      id: true,
      caseNumber: true,
      status: true,
      startedAt: true,
      nextActionAt: true,
      completedAt: true,
      quotedAmount: true,
      agreedAmount: true,
      notes: true,
      client: {
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      service: { select: { id: true, code: true, name: true } },
      stage: { select: { id: true, key: true, name: true, color: true } },
      assignedTo: { select: { id: true, name: true } },
      creditCase: { select: { id: true, caseCode: true } },
      homeBuyerCase: true,
      fundingCase: { include: { applications: { orderBy: { createdAt: "desc" } } } },
      personalLoanCase: true,
      projectCase: true,
    },
  });
  if (!serviceCase) throw new DomainError("Expediente no encontrado.");

  const [stageHistory, notes, timeline, openTasks, balance] = await Promise.all([
    prisma.serviceCaseStageHistory.findMany({
      where: { serviceCaseId: serviceCase.id },
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
    prisma.note.findMany({
      where: { organizationId: ctx.organizationId, serviceCaseId: serviceCase.id },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.activityLog.findMany({
      where: { organizationId: ctx.organizationId, serviceCaseId: serviceCase.id },
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
    prisma.task.findMany({
      where: {
        organizationId: ctx.organizationId,
        serviceCaseId: serviceCase.id,
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
    serviceCaseBalance(ctx, serviceCase.id),
  ]);

  return { serviceCase, stageHistory, notes, timeline, openTasks, balance };
}
