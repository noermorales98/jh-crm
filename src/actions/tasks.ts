"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import {
  cuidSchema,
  orgDateInputSchema,
  resolveOrgDateInput,
} from "@/src/lib/validation/common";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import * as taskService from "@/src/server/tasks";

function revalidateTasks() {
  revalidatePath("/crm/tareas");
  revalidatePath("/crm/dashboard");
}

const taskTypeEnum = z.enum([
  "FOLLOW_UP",
  "REQUEST_DOCUMENT",
  "REQUEST_PAYMENT",
  "CREDIT_UPDATE",
  "PREPARE_ROUND",
  "CALL",
  "MESSAGE",
  "REVIEW_RESULT",
  "OTHER",
]);
const taskPriorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
const taskStatusEnum = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

const createTaskSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio.").max(200),
  description: z.string().trim().max(5000).nullish(),
  type: taskTypeEnum.optional(),
  priority: taskPriorityEnum.optional(),
  dueAt: orgDateInputSchema,
  reminderAt: orgDateInputSchema,
  assignedToId: cuidSchema.optional(),
  clientId: cuidSchema.nullish(),
  caseId: cuidSchema.nullish(),
  roundId: cuidSchema.nullish(),
});

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("tasks.manage");
    const data = createTaskSchema.parse(input);
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const dueAt = resolveOrgDateInput(data.dueAt, tz, 12) ?? null;
    const reminderAt = resolveOrgDateInput(data.reminderAt, tz, 9) ?? null;
    const task = await taskService.createTask(ctx, {
      title: data.title,
      description: data.description,
      type: data.type,
      priority: data.priority,
      assignedToId: data.assignedToId,
      clientId: data.clientId,
      caseId: data.caseId,
      roundId: data.roundId,
      dueAt,
      reminderAt,
    });
    revalidateTasks();
    return actionOk({ id: task.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullish(),
  type: taskTypeEnum.optional(),
  priority: taskPriorityEnum.optional(),
  dueAt: orgDateInputSchema,
  reminderAt: orgDateInputSchema,
  status: taskStatusEnum.optional(),
});

export async function updateTask(
  taskId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("tasks.manage");
    const id = cuidSchema.parse(taskId);
    const data = updateTaskSchema.parse(input);
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const dueAt = resolveOrgDateInput(data.dueAt, tz, 12);
    const reminderAt = resolveOrgDateInput(data.reminderAt, tz, 9);
    const task = await taskService.updateTask(ctx, id, {
      title: data.title,
      description: data.description,
      type: data.type,
      priority: data.priority,
      status: data.status,
      ...(dueAt !== undefined ? { dueAt } : {}),
      ...(reminderAt !== undefined ? { reminderAt } : {}),
    });
    revalidateTasks();
    return actionOk({ id: task.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function completeTask(taskId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("tasks.manage");
    const id = cuidSchema.parse(taskId);
    const task = await taskService.completeTask(ctx, id);
    revalidateTasks();
    return actionOk({ id: task.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function cancelTask(taskId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("tasks.manage");
    const id = cuidSchema.parse(taskId);
    const task = await taskService.cancelTask(ctx, id);
    revalidateTasks();
    return actionOk({ id: task.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const reassignSchema = z.object({ assignedToId: cuidSchema });

export async function reassignTask(
  taskId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("tasks.manage");
    const id = cuidSchema.parse(taskId);
    const { assignedToId } = reassignSchema.parse(input);
    const task = await taskService.reassignTask(ctx, id, assignedToId);
    revalidateTasks();
    return actionOk({ id: task.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
