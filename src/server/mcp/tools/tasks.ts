import { z } from "zod";
import { cuidSchema, resolveOrgDateInput } from "@/src/lib/validation/common";
import {
  createTaskSchema,
  reassignSchema,
  updateTaskSchema,
} from "@/src/lib/validation/tasks-actions";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import * as taskService from "@/src/server/tasks";
import { defineTool, type Tool } from "./types";

/**
 * Escritura de tareas (T019). Cada herramienta replica su action de `src/actions/tasks.ts`:
 * mismo permiso, mismo esquema, misma resolución de fechas en la zona de la organización.
 */

const TASK_PATHS = ["/crm/tareas", "/crm/dashboard"];

const tareaId = cuidSchema.describe("Identificador de la tarea (se obtiene con `listar` o `ver` en la sección tareas).");
const fechaDesc =
  "Fecha límite como AAAA-MM-DD (se interpreta en la zona horaria de la organización) o instante completo; null la quita.";

const create = createTaskSchema.shape;
const update = updateTaskSchema.shape;

function taskResult(task: { id: string; title: string; status: string; assignedToId: string }) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    assignedToId: task.assignedToId,
    href: `/crm/tareas/${task.id}`,
  };
}

const auditTask = (input: { tareaId: string }, result: unknown) => ({
  entityType: "Task",
  entityId: (result as { id?: string } | null)?.id ?? input.tareaId,
});

const crearTarea = defineTool({
  name: "crear_tarea",
  title: "Crear tarea",
  description:
    "Crea una tarea en el CRM con título, tipo, prioridad, fechas y responsable; puede ligarse a un cliente, caso o ronda. Úsala cuando la persona pida agendar o recordar algo que alguien del equipo debe hacer.",
  kind: "write",
  permission: "tasks.manage",
  inputSchema: z.object({
    title: create.title.describe("Título de la tarea (obligatorio, máximo 200 caracteres)."),
    description: create.description.describe("Detalle opcional de la tarea."),
    type: create.type.describe(
      "Tipo: FOLLOW_UP, REQUEST_DOCUMENT, REQUEST_PAYMENT, CREDIT_UPDATE, PREPARE_ROUND, CALL, MESSAGE, REVIEW_RESULT u OTHER.",
    ),
    priority: create.priority.describe("Prioridad: LOW, NORMAL, HIGH o URGENT."),
    dueAt: create.dueAt.describe(fechaDesc),
    reminderAt: create.reminderAt.describe("Fecha del recordatorio, AAAA-MM-DD (a las 09:00 de la organización) o instante completo."),
    assignedToId: create.assignedToId.describe("Identificador del miembro responsable; si se omite se usa el predeterminado de la organización."),
    clientId: create.clientId.describe("Identificador del cliente al que se liga la tarea."),
    caseId: create.caseId.describe("Identificador del caso de crédito al que se liga."),
    roundId: create.roundId.describe("Identificador de la ronda de disputas a la que se liga."),
  }),
  async run(ctx, data) {
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
    return taskResult(task);
  },
  audit: (_input, result) => ({ entityType: "Task", entityId: (result as { id: string }).id }),
  revalidate: () => TASK_PATHS,
});

const editarTarea = defineTool({
  name: "editar_tarea",
  title: "Editar tarea",
  description:
    "Cambia el título, descripción, tipo, prioridad, fechas o estado de una tarea abierta. Úsala cuando la persona quiera corregir o reprogramar una tarea; no sirve para tareas ya completadas o canceladas.",
  kind: "write",
  permission: "tasks.manage",
  inputSchema: z.object({
    tareaId,
    title: update.title.describe("Nuevo título."),
    description: update.description.describe("Nueva descripción; null la borra."),
    type: update.type.describe("Nuevo tipo de tarea."),
    priority: update.priority.describe("Nueva prioridad: LOW, NORMAL, HIGH o URGENT."),
    dueAt: update.dueAt.describe(fechaDesc),
    reminderAt: update.reminderAt.describe("Nueva fecha de recordatorio (AAAA-MM-DD o instante); null la quita."),
    status: update.status.describe("Nuevo estado: PENDING, IN_PROGRESS, COMPLETED o CANCELLED."),
  }),
  async run(ctx, input) {
    const { tareaId: id, ...data } = input;
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
    return taskResult(task);
  },
  audit: auditTask,
  revalidate: () => TASK_PATHS,
});

const completarTarea = defineTool({
  name: "completar_tarea",
  title: "Completar tarea",
  description:
    "Marca una tarea como completada y registra la fecha de cierre. Úsala cuando la persona diga que una tarea ya se hizo.",
  kind: "write",
  permission: "tasks.manage",
  inputSchema: z.object({ tareaId }),
  async run(ctx, { tareaId: id }) {
    return taskResult(await taskService.completeTask(ctx, id));
  },
  audit: auditTask,
  revalidate: () => TASK_PATHS,
});

const reasignarTarea = defineTool({
  name: "reasignar_tarea",
  title: "Reasignar tarea",
  description:
    "Cambia el responsable de una tarea a otro miembro de la organización. Úsala cuando la persona pida pasar una tarea a otra persona del equipo.",
  kind: "write",
  permission: "tasks.manage",
  inputSchema: z.object({
    tareaId,
    assignedToId: reassignSchema.shape.assignedToId.describe("Identificador del nuevo responsable (miembro de la organización)."),
  }),
  async run(ctx, { tareaId: id, assignedToId }) {
    return taskResult(await taskService.reassignTask(ctx, id, assignedToId));
  },
  audit: auditTask,
  revalidate: () => TASK_PATHS,
});

const cancelarTarea = defineTool({
  name: "cancelar_tarea",
  title: "Cancelar tarea",
  description:
    "Cancela una tarea: la tarea queda con estado CANCELLED y no se borra, pero una tarea cancelada ya no se puede editar ni reabrir. Pide confirmación a la persona antes de ejecutarla. No aplica a tareas completadas.",
  kind: "destructive",
  permission: "tasks.manage",
  inputSchema: z.object({ tareaId }),
  async run(ctx, { tareaId: id }) {
    return taskResult(await taskService.cancelTask(ctx, id));
  },
  audit: auditTask,
  revalidate: () => TASK_PATHS,
});

/** Herramientas de escritura de la sección (T019). */
export const tasksTools: Tool[] = [crearTarea, editarTarea, completarTarea, reasignarTarea, cancelarTarea] as Tool[];
