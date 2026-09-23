import type { TaskDueBucket } from "@/src/lib/format/dates";

/**
 * Badge operativo de una Task: única fuente para la cola «Para hacer» del
 * dashboard (server) y la tabla de tareas. Función pura, sin Prisma.
 */
export type TaskWorkBadge =
  | "Urgente"
  | "Hoy"
  | "Cobrar"
  | "Docs"
  | "Lead"
  | "Próxima"
  | "Pendiente";

export type TaskWorkBadgeTone = "danger" | "warning" | "neutral";

export interface TaskWorkBadgeInput {
  type: string;
  title: string;
  status: string;
  externalKey?: string | null;
  description?: string | null;
}

const TONES: Record<TaskWorkBadge, TaskWorkBadgeTone> = {
  Urgente: "danger",
  Hoy: "warning",
  Cobrar: "warning",
  Docs: "warning",
  Lead: "warning",
  Próxima: "neutral",
  Pendiente: "neutral",
};

export function taskWorkBadge(
  task: TaskWorkBadgeInput,
  bucket: TaskDueBucket,
): { label: TaskWorkBadge; tone: TaskWorkBadgeTone } {
  const label = taskWorkBadgeLabel(task, bucket);
  return { label, tone: TONES[label] };
}

function taskWorkBadgeLabel(
  task: TaskWorkBadgeInput,
  bucket: TaskDueBucket,
): TaskWorkBadge {
  const open = task.status === "PENDING" || task.status === "IN_PROGRESS";
  // Vencida y abierta: siempre Urgente (cualquier tipo).
  if (bucket === "overdue" && open) return "Urgente";
  if (task.type === "REQUEST_PAYMENT") return "Cobrar";
  if (task.type === "REQUEST_DOCUMENT") return "Docs";
  if (
    task.externalKey?.startsWith("opportunity:") ||
    task.title.startsWith("Contactar")
  ) {
    return "Lead";
  }
  if (
    task.externalKey?.endsWith(":nextAction") ||
    task.description?.includes("nextAction") ||
    task.title.startsWith("Próxima acción")
  ) {
    return "Próxima";
  }
  if (bucket === "today") return "Hoy";
  return "Pendiente";
}
