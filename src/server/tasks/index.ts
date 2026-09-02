import type { Prisma, TaskPriority, TaskStatus, TaskType } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { zonedDayRange } from "@/src/lib/format/dates";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import { resolveAssigneeForOrg } from "@/src/server/users";

/**
 * Servicio de tareas/recordatorios internos.
 */

export interface TaskCreateData {
  title: string;
  description?: string | null;
  type?: TaskType;
  priority?: TaskPriority;
  dueAt?: Date | null;
  reminderAt?: Date | null;
  assignedToId?: string;
  clientId?: string | null;
  caseId?: string | null;
  roundId?: string | null;
}

export interface TaskUpdateData {
  title?: string;
  description?: string | null;
  type?: TaskType;
  priority?: TaskPriority;
  dueAt?: Date | null;
  reminderAt?: Date | null;
  status?: TaskStatus;
}

export type TaskDueFilter = "overdue" | "today" | "week";

export interface TaskListFilters {
  status?: TaskStatus;
  type?: TaskType;
  assignedToId?: string;
  due?: TaskDueFilter;
  clientId?: string;
  caseId?: string;
  cursor?: string;
  limit?: number;
}

const TASK_LIST_SELECT = {
  id: true,
  title: true,
  type: true,
  priority: true,
  status: true,
  dueAt: true,
  reminderAt: true,
  completedAt: true,
  createdAt: true,
  client: { select: { id: true, clientCode: true, firstName: true, lastName: true } },
  case: { select: { id: true, caseCode: true } },
  round: { select: { id: true, roundNumber: true } },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

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

async function getTaskOrThrow(ctx: OrganizationContext, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: ctx.organizationId },
  });
  if (!task) throw new DomainError("Tarea no encontrada.");
  return task;
}

/** Valida que las entidades enlazadas existan en la organización. */
async function validateLinks(
  ctx: OrganizationContext,
  links: { clientId?: string | null; caseId?: string | null; roundId?: string | null },
): Promise<{ clientId: string | null }> {
  let clientId = links.clientId ?? null;

  if (links.caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: { id: links.caseId, organizationId: ctx.organizationId },
      select: { id: true, clientId: true },
    });
    if (!creditCase) throw new DomainError("El caso enlazado no existe.");
    if (clientId && clientId !== creditCase.clientId) {
      throw new DomainError("La tarea no puede enlazar un cliente distinto al del caso.");
    }
    clientId = creditCase.clientId;
  }

  if (links.roundId) {
    const round = await prisma.creditRound.findFirst({
      where: { id: links.roundId, organizationId: ctx.organizationId },
      select: { id: true, caseId: true, case: { select: { clientId: true } } },
    });
    if (!round) throw new DomainError("La ronda enlazada no existe.");
    if (links.caseId && round.caseId !== links.caseId) {
      throw new DomainError("La ronda no pertenece al caso enlazado.");
    }
    clientId = clientId ?? round.case.clientId;
    if (clientId !== round.case.clientId) {
      throw new DomainError("La tarea no puede enlazar un cliente distinto al de la ronda.");
    }
  }

  if (links.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: links.clientId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!client) throw new DomainError("El cliente enlazado no existe.");
  }

  return { clientId };
}

export async function createTask(ctx: OrganizationContext, data: TaskCreateData) {
  const assigneeId = await resolveAssigneeForOrg(
    ctx.organizationId,
    data.assignedToId,
  );
  if (!assigneeId) {
    throw new DomainError("Selecciona un responsable.");
  }
  await assertMember(ctx, assigneeId);
  const { clientId } = await validateLinks(ctx, data);

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        organizationId: ctx.organizationId,
        title: data.title,
        description: data.description ?? null,
        type: data.type ?? "OTHER",
        priority: data.priority ?? "NORMAL",
        dueAt: data.dueAt ?? null,
        reminderAt: data.reminderAt ?? null,
        assignedToId: assigneeId,
        createdById: ctx.userId,
        clientId,
        caseId: data.caseId ?? null,
        roundId: data.roundId ?? null,
      },
    });

    // ActivityLog requiere clientId: solo se registra si la tarea está ligada.
    if (clientId) {
      await writeActivityLog(
        toActivityContext(ctx),
        {
          type: "TASK_CREATED",
          description: `Tarea creada: ${task.title}`,
          clientId,
          caseId: data.caseId ?? null,
          roundId: data.roundId ?? null,
          metadata: { taskId: task.id, taskType: task.type },
        },
        tx,
      );
    }

    return task;
  });
}

export async function updateTask(
  ctx: OrganizationContext,
  taskId: string,
  data: TaskUpdateData,
) {
  const task = await getTaskOrThrow(ctx, taskId);
  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    throw new DomainError("No se puede editar una tarea completada o cancelada.");
  }
  return prisma.task.update({
    where: { id: task.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {}),
      ...(data.reminderAt !== undefined ? { reminderAt: data.reminderAt } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  });
}

export async function completeTask(ctx: OrganizationContext, taskId: string) {
  const task = await getTaskOrThrow(ctx, taskId);
  if (task.status === "COMPLETED") throw new DomainError("La tarea ya está completada.");
  if (task.status === "CANCELLED") throw new DomainError("La tarea está cancelada.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: task.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (task.clientId) {
      await writeActivityLog(
        toActivityContext(ctx),
        {
          type: "TASK_COMPLETED",
          description: `Tarea completada: ${task.title}`,
          clientId: task.clientId,
          caseId: task.caseId,
          roundId: task.roundId,
          metadata: { taskId: task.id, taskType: task.type },
        },
        tx,
      );
    }
    return updated;
  });
}

export async function cancelTask(ctx: OrganizationContext, taskId: string) {
  const task = await getTaskOrThrow(ctx, taskId);
  if (task.status === "COMPLETED") {
    throw new DomainError("No se puede cancelar una tarea completada.");
  }
  return prisma.task.update({
    where: { id: task.id },
    data: { status: "CANCELLED" },
  });
}

export async function reassignTask(
  ctx: OrganizationContext,
  taskId: string,
  assignedToId: string,
) {
  const task = await getTaskOrThrow(ctx, taskId);
  await assertMember(ctx, assignedToId);
  return prisma.task.update({
    where: { id: task.id },
    data: { assignedToId },
  });
}

export async function getTask(ctx: OrganizationContext, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: ctx.organizationId },
    select: {
      ...TASK_LIST_SELECT,
      description: true,
    },
  });
  if (!task) throw new DomainError("Tarea no encontrada.");
  return task;
}

export async function listTasks(ctx: OrganizationContext, filters: TaskListFilters = {}) {
  const limit = Math.min(filters.limit ?? 20, 100);

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { timezone: true },
  });
  const timezone = settings?.timezone ?? "America/Chicago";

  let dueFilter: Prisma.TaskWhereInput = {};
  if (filters.due) {
    const { start, end } = zonedDayRange(new Date(), timezone);
    if (filters.due === "overdue") {
      dueFilter = {
        dueAt: { lt: new Date() },
        status: filters.status ?? { in: ["PENDING", "IN_PROGRESS"] },
      };
    } else if (filters.due === "today") {
      dueFilter = { dueAt: { gte: start, lt: end } };
    } else {
      // week: hoy + 6 días
      dueFilter = {
        dueAt: { gte: start, lt: new Date(end.getTime() + 6 * 24 * 60 * 60 * 1000) },
      };
    }
  }

  const where: Prisma.TaskWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.caseId ? { caseId: filters.caseId } : {}),
    ...dueFilter,
  };

  const rows = await prisma.task.findMany({
    where,
    select: TASK_LIST_SELECT,
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
