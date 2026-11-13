"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema, resolveOrgDateInput } from "@/src/lib/validation/common";
import {
  createTaskSchema,
  reassignSchema,
  updateTaskSchema,
} from "@/src/lib/validation/tasks-actions";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import * as taskService from "@/src/server/tasks";

function revalidateTasks() {
  revalidatePath("/crm/tareas");
  revalidatePath("/crm/dashboard");
}

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
