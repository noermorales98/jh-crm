import { z } from "zod";
import { cuidSchema, orgDateInputSchema } from "./common";

/**
 * Esquemas de entrada de las acciones de tareas (`src/actions/tasks.ts`). Viven aquí
 * porque un archivo "use server" solo puede exportar funciones; los comparten la
 * acción y la herramienta del conector.
 */

export const taskTypeEnum = z.enum([
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
export const taskPriorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export const taskStatusEnum = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export const createTaskSchema = z.object({
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

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullish(),
  type: taskTypeEnum.optional(),
  priority: taskPriorityEnum.optional(),
  dueAt: orgDateInputSchema,
  reminderAt: orgDateInputSchema,
  status: taskStatusEnum.optional(),
});

export const reassignSchema = z.object({ assignedToId: cuidSchema });
