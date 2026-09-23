import type { Prisma, TaskPriority, TaskStatus, TaskType } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import {
  classifyTaskDue,
  zonedDayRange,
  zonedWeekRange,
} from "@/src/lib/format/dates";
import { taskWorkBadge, type TaskWorkBadge } from "@/src/lib/task-work-badge";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
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

const OPEN_TASK_STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS"];

export interface TaskListFilters {
  status?: TaskStatus;
  type?: TaskType;
  assignedToId?: string;
  due?: TaskDueFilter;
  clientId?: string;
  caseId?: string;
  serviceCaseId?: string;
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
  externalKey: true,
  client: {
    select: {
      id: true,
      clientCode: true,
      firstName: true,
      lastName: true,
      status: true,
      source: true,
      leadChannel: true,
      serviceRequested: true,
    },
  },
  case: {
    select: {
      id: true,
      caseCode: true,
      summary: true,
      stage: { select: { id: true, name: true } },
    },
  },
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
): Promise<{ clientId: string | null; serviceCaseId: string | null }> {
  let clientId = links.clientId ?? null;
  let serviceCaseId: string | null = null;

  if (links.caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: { id: links.caseId, organizationId: ctx.organizationId },
      select: { id: true, clientId: true, serviceCaseId: true },
    });
    if (!creditCase) throw new DomainError("El caso enlazado no existe.");
    if (clientId && clientId !== creditCase.clientId) {
      throw new DomainError("La tarea no puede enlazar un cliente distinto al del caso.");
    }
    clientId = creditCase.clientId;
    serviceCaseId = creditCase.serviceCaseId;
  }

  if (links.roundId) {
    const round = await prisma.creditRound.findFirst({
      where: { id: links.roundId, organizationId: ctx.organizationId },
      select: {
        id: true,
        caseId: true,
        case: { select: { clientId: true, serviceCaseId: true } },
      },
    });
    if (!round) throw new DomainError("La ronda enlazada no existe.");
    if (links.caseId && round.caseId !== links.caseId) {
      throw new DomainError("La ronda no pertenece al caso enlazado.");
    }
    clientId = clientId ?? round.case.clientId;
    if (clientId !== round.case.clientId) {
      throw new DomainError("La tarea no puede enlazar un cliente distinto al de la ronda.");
    }
    serviceCaseId = serviceCaseId ?? round.case.serviceCaseId;
  }

  if (links.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: links.clientId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!client) throw new DomainError("El cliente enlazado no existe.");
  }

  return { clientId, serviceCaseId };
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
  const { clientId, serviceCaseId } = await validateLinks(ctx, data);

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
        serviceCaseId,
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
          serviceCaseId,
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

  const timezone = await getOrganizationTimezone(ctx.organizationId);

  let dueFilter: Prisma.TaskWhereInput = {};
  if (filters.due) {
    const now = new Date();
    const { start, end } = zonedDayRange(now, timezone);
    if (filters.due === "overdue") {
      dueFilter = {
        dueAt: { lt: start },
        // Vencidas solo cuentan si siguen abiertas (salvo filtro explícito).
        ...(!filters.status ? { status: { in: OPEN_TASK_STATUSES } } : {}),
      };
    } else if (filters.due === "today") {
      dueFilter = { dueAt: { gte: start, lt: end } };
    } else {
      const week = zonedWeekRange(now, timezone);
      dueFilter = {
        dueAt: { gte: week.start, lt: week.end },
      };
    }
  }

  const where: Prisma.TaskWhereInput = {
    organizationId: ctx.organizationId,
    // Por defecto: solo abiertas. Completadas viven en ?status=COMPLETED.
    ...(filters.status
      ? { status: filters.status }
      : { status: { in: OPEN_TASK_STATUSES } }),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.caseId || filters.serviceCaseId
      ? {
          OR: [
            ...(filters.caseId ? [{ caseId: filters.caseId }] : []),
            ...(filters.serviceCaseId
              ? [{ serviceCaseId: filters.serviceCaseId }]
              : []),
          ],
        }
      : {}),
    ...dueFilter,
  };

  const rows = await prisma.task.findMany({
    where,
    select: TASK_LIST_SELECT,
    // Enum MySQL: PENDING → IN_PROGRESS → COMPLETED → CANCELLED
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }, { id: "asc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

/** Cuenta tareas completadas de la organización (para el pie de /crm/tareas). */
export async function countCompletedTasks(ctx: OrganizationContext) {
  return prisma.task.count({
    where: {
      organizationId: ctx.organizationId,
      status: "COMPLETED",
    },
  });
}

/** Cuenta tareas abiertas por tipo (catálogo en /crm/tareas). */
export async function countOpenTasksByType(ctx: OrganizationContext) {
  const rows = await prisma.task.groupBy({
    by: ["type"],
    where: {
      organizationId: ctx.organizationId,
      status: { in: OPEN_TASK_STATUSES },
    },
    _count: { _all: true },
  });
  return Object.fromEntries(
    rows.map((r) => [r.type, r._count._all]),
  ) as Partial<Record<TaskType, number>>;
}

export type AttentionTaskBadge = TaskWorkBadge;

const ATTENTION_SELECT = {
  ...TASK_LIST_SELECT,
  description: true,
} satisfies Prisma.TaskSelect;

type AttentionRow = Prisma.TaskGetPayload<{ select: typeof ATTENTION_SELECT }>;

/**
 * Cola unificada para dashboard «Para hacer»: solo Tasks abiertas.
 * Cuatro consultas secuenciales (vencidas → hoy → resto con fecha → sin fecha)
 * para no perder vencidas LOW detrás de muchas URGENT futuras.
 */
export async function listAttentionTasks(
  ctx: OrganizationContext,
  opts?: { take?: number; timezone?: string },
) {
  const take = Math.min(opts?.take ?? 12, 40);
  const timezone =
    opts?.timezone ?? (await getOrganizationTimezone(ctx.organizationId));
  const now = new Date();
  const { start: todayStart, end: todayEnd } = zonedDayRange(now, timezone);

  const baseWhere: Prisma.TaskWhereInput = {
    organizationId: ctx.organizationId,
    status: { in: OPEN_TASK_STATUSES },
  };

  const rows: AttentionRow[] = [];

  async function fill(
    where: Prisma.TaskWhereInput,
    orderBy: Prisma.TaskOrderByWithRelationInput[],
  ) {
    const need = take - rows.length;
    if (need <= 0) return;
    const batch = await prisma.task.findMany({
      where: { ...baseWhere, ...where },
      select: ATTENTION_SELECT,
      orderBy,
      take: need,
    });
    rows.push(...batch);
  }

  // a. Vencidas (más antigua primero)
  await fill(
    { dueAt: { lt: todayStart } },
    [{ dueAt: "asc" }, { id: "asc" }],
  );
  // b. Hoy (prioridad desc, luego fecha)
  await fill(
    { dueAt: { gte: todayStart, lt: todayEnd } },
    [{ priority: "desc" }, { dueAt: "asc" }, { id: "asc" }],
  );
  // c. Resto con fecha (dueAt >= todayEnd)
  await fill(
    { dueAt: { gte: todayEnd } },
    [{ priority: "desc" }, { dueAt: "asc" }, { id: "asc" }],
  );
  // d. Sin fecha (consulta aparte: MySQL y nulls)
  await fill(
    { dueAt: null },
    [{ priority: "desc" }, { createdAt: "desc" }, { id: "asc" }],
  );

  return rows.map((task) => {
    const dueBucket = classifyTaskDue(task.dueAt, now, timezone);
    const { label: badge, tone } = taskWorkBadge(task, dueBucket);
    return {
      id: task.id,
      title: task.title,
      detail: [
        task.client
          ? [task.client.firstName, task.client.lastName].filter(Boolean).join(" ")
          : null,
        task.case?.caseCode ?? null,
        task.dueAt ? `vence` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/crm/tareas/${task.id}`,
      tone,
      badge,
      dueBucket,
      type: task.type,
      dueAt: task.dueAt,
      client: task.client,
      case: task.case,
    };
  });
}
