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
        // Vencidas solo cuentan si siguen abiertas (salvo filtro explícito).
        ...(!filters.status ? { status: { in: OPEN_TASK_STATUSES } } : {}),
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

export type AttentionTaskBadge =
  | "Urgente"
  | "Hoy"
  | "Cobrar"
  | "Docs"
  | "Lead"
  | "Próxima"
  | "Pendiente";

/**
 * Cola unificada para dashboard «Para hacer»: solo Tasks abiertas, ordenadas.
 */
export async function listAttentionTasks(
  ctx: OrganizationContext,
  opts?: { take?: number; timezone?: string },
) {
  const take = Math.min(opts?.take ?? 12, 40);
  const timezone = opts?.timezone ?? "America/Chicago";
  const now = new Date();
  const { start: todayStart, end: todayEnd } = zonedDayRange(now, timezone);

  const rows = await prisma.task.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: { in: OPEN_TASK_STATUSES },
    },
    select: {
      ...TASK_LIST_SELECT,
      description: true,
      externalKey: true,
    },
    orderBy: [
      { priority: "desc" },
      { dueAt: "asc" },
      { createdAt: "desc" },
      { id: "asc" },
    ],
    take: take * 3,
  });

  function badgeFor(task: (typeof rows)[number]): AttentionTaskBadge {
    const due = task.dueAt ? new Date(task.dueAt) : null;
    const overdue = due != null && due.getTime() < now.getTime();
    const today =
      due != null && due.getTime() >= todayStart.getTime() && due.getTime() < todayEnd.getTime();
    if (task.type === "REQUEST_PAYMENT") return overdue ? "Urgente" : "Cobrar";
    if (task.type === "REQUEST_DOCUMENT") return "Docs";
    if (
      task.externalKey?.startsWith("opportunity:") ||
      task.title.startsWith("Contactar")
    ) {
      return overdue ? "Urgente" : "Lead";
    }
    if (task.description?.includes("nextAction") || task.title.startsWith("Próxima acción")) {
      return overdue ? "Urgente" : "Próxima";
    }
    if (overdue) return "Urgente";
    if (today) return "Hoy";
    return "Pendiente";
  }

  function urgencyRank(task: (typeof rows)[number]): number {
    const b = badgeFor(task);
    if (b === "Urgente") return 0;
    if (b === "Hoy") return 1;
    if (b === "Cobrar" || b === "Docs" || b === "Lead") return 2;
    if (b === "Próxima") return 3;
    return 4;
  }

  const sorted = [...rows].sort((a, b) => {
    const ur = urgencyRank(a) - urgencyRank(b);
    if (ur !== 0) return ur;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });

  return sorted.slice(0, take).map((task) => {
    const badge = badgeFor(task);
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
      tone: (badge === "Urgente"
        ? "danger"
        : badge === "Hoy" || badge === "Cobrar" || badge === "Docs" || badge === "Lead"
          ? "warning"
          : "neutral") as "danger" | "warning" | "neutral",
      badge,
      type: task.type,
      dueAt: task.dueAt,
      client: task.client,
      case: task.case,
    };
  });
}
