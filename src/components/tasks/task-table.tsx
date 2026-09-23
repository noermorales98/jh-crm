import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardList } from "lucide-react";
import {
  EmptyState,
  Pill,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import {
  classifyTaskDue,
  DEFAULT_TIMEZONE,
} from "@/src/lib/format/dates";
import { TASK_TYPE_LABELS, labelFor } from "@/src/lib/labels";
import { taskWorkBadge, type TaskWorkBadgeTone } from "@/src/lib/task-work-badge";
import { clientFullName } from "@/src/server/page-helpers";
import { TaskRowActions } from "./task-row-actions";

export interface TaskRow {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  dueAt: Date | null;
  externalKey?: string | null;
  description?: string | null;
  client: {
    id: string;
    clientCode: string;
    firstName: string;
    lastName: string | null;
  } | null;
  case: {
    id: string;
    caseCode: string;
    summary?: string | null;
    stage?: { id: string; name: string } | null;
  } | null;
  assignedTo?: { id: string; name: string | null } | null;
}


const PILL_TONE: Record<TaskWorkBadgeTone, "red" | "amber" | "slate"> = {
  danger: "red",
  warning: "amber",
  neutral: "slate",
};

/** Badge compartido con la cola del dashboard; «Pendiente» no se muestra aquí. */
function workBadge(task: TaskRow, timezone: string) {
  const badge = taskWorkBadge(task, classifyTaskDue(task.dueAt, new Date(), timezone));
  if (badge.label === "Pendiente") return null;
  return { label: badge.label, tone: PILL_TONE[badge.tone] };
}

function caseLabel(c: NonNullable<TaskRow["case"]>) {
  const summary = c.summary?.trim();
  if (summary) return summary;
  if (c.stage?.name) return c.stage.name;
  return "Sin descripción";
}

/**
 * Tabla de tareas (server component) compartida por /tareas y
 * /casos/[id]/tareas. Resalta vencidas y muestra acciones inline si
 * canManage y la tarea sigue abierta.
 */
export function TaskTable({
  tasks,
  members,
  canManage,
  showLinks = true,
  showWorkBadges = false,
  emptyAction,
  timezone = DEFAULT_TIMEZONE,
}: {
  tasks: TaskRow[];
  members: { id: string; name: string }[];
  canManage: boolean;
  showLinks?: boolean;
  showWorkBadges?: boolean;
  emptyAction?: ReactNode;
  timezone?: string;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Nada pendiente por aquí"
        description="Cuando tengas algo pendiente, aparecerá en esta lista."
        action={emptyAction}
      />
    );
  }

  const now = new Date();

  return (
    <Table>
      <THead>
        <TR>
          <TH>Título</TH>
          <TH>Tipo</TH>
          <TH>Prioridad</TH>
          {showLinks ? <TH>Cliente / Caso</TH> : null}
          <TH>Vencimiento</TH>
          <TH>Estado</TH>
          {canManage ? <TH className="text-right">Acciones</TH> : null}
        </TR>
      </THead>
      <TBody>
        {tasks.map((task) => {
          const open = task.status === "PENDING" || task.status === "IN_PROGRESS";
          const overdue =
            classifyTaskDue(task.dueAt, now, timezone) === "overdue" && open;
          return (
            <TR key={task.id}>
              <TD className="max-w-72">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/crm/tareas/${task.id}`}
                    className={`min-w-0 flex-1 truncate font-medium hover:underline ${
                      task.status === "COMPLETED"
                        ? "text-text-secondary line-through"
                        : "text-ink"
                    }`}
                  >
                    {task.title}
                  </Link>
                  {showWorkBadges
                    ? (() => {
                        const badge = workBadge(task, timezone);
                        return badge ? <Pill tone={badge.tone}>{badge.label}</Pill> : null;
                      })()
                    : null}
                </div>
              </TD>
              <TD className="whitespace-nowrap">
                {labelFor(TASK_TYPE_LABELS, task.type)}
              </TD>
              <TD>
                <StatusPill domain="taskPriority" value={task.priority} />
              </TD>
              {showLinks ? (
                <TD className="max-w-56">
                  <div className="text-xs">
                    {task.client ? (
                      <Link
                        href={`/crm/clientes/${task.client.id}`}
                        className="block text-action-primary hover:text-action-secondary"
                      >
                        {clientFullName(task.client)}
                      </Link>
                    ) : (
                      <span className="block text-text-secondary">Sin cliente</span>
                    )}
                    {task.case ? (
                      <Link
                        href={`/crm/casos/${task.case.id}`}
                        className="block truncate text-text-secondary hover:text-ink"
                        title={caseLabel(task.case)}
                      >
                        {caseLabel(task.case)}
                      </Link>
                    ) : null}
                  </div>
                </TD>
              ) : null}
              <TD
                className={`whitespace-nowrap ${overdue ? "font-medium text-danger-ink" : "text-text-secondary"}`}
              >
                {task.dueAt ? formatDate(task.dueAt, timezone) : "—"}
                {overdue ? " · vencida" : ""}
              </TD>
              <TD>
                <StatusPill domain="taskStatus" value={task.status} />
              </TD>
              {canManage ? (
                <TD className="text-right">
                  {open ? (
                    <TaskRowActions
                      taskId={task.id}
                      members={members}
                      currentAssigneeId={task.assignedTo?.id ?? null}
                    />
                  ) : null}
                </TD>
              ) : null}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
