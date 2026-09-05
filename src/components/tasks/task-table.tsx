import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardList } from "lucide-react";
import {
  EmptyState,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { TASK_TYPE_LABELS, labelFor } from "@/src/lib/labels";
import { clientFullName } from "@/src/server/page-helpers";
import { TaskRowActions } from "./task-row-actions";

export interface TaskRow {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  dueAt: Date | null;
  client: {
    id: string;
    clientCode: string;
    firstName: string;
    lastName: string | null;
  } | null;
  case: { id: string; caseCode: string } | null;
  assignedTo: { id: string; name: string | null } | null;
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
  emptyAction,
}: {
  tasks: TaskRow[];
  members: { id: string; name: string }[];
  canManage: boolean;
  showLinks?: boolean;
  emptyAction?: ReactNode;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Nada pendiente por aquí"
        description="Cuando tengas algo que hacer hoy, aparecerá en esta lista."
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
          <TH>Responsable</TH>
          <TH>Vencimiento</TH>
          <TH>Estado</TH>
          {canManage ? <TH className="text-right">Acciones</TH> : null}
        </TR>
      </THead>
      <TBody>
        {tasks.map((task) => {
          const overdue =
            task.dueAt &&
            new Date(task.dueAt) < now &&
            (task.status === "PENDING" || task.status === "IN_PROGRESS");
          const open = task.status === "PENDING" || task.status === "IN_PROGRESS";
          return (
            <TR key={task.id}>
              <TD className="max-w-72">
                <span
                  className={`block truncate font-medium ${
                    task.status === "COMPLETED"
                      ? "text-text-secondary line-through"
                      : "text-ink"
                  }`}
                >
                  {task.title}
                </span>
              </TD>
              <TD className="whitespace-nowrap">
                {labelFor(TASK_TYPE_LABELS, task.type)}
              </TD>
              <TD>
                <StatusPill domain="taskPriority" value={task.priority} />
              </TD>
              {showLinks ? (
                <TD className="whitespace-nowrap">
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
                        className="block text-text-secondary hover:text-ink"
                      >
                        {task.case.caseCode}
                      </Link>
                    ) : null}
                  </div>
                </TD>
              ) : null}
              <TD className="whitespace-nowrap">
                {task.assignedTo?.name ?? (
                  <span className="text-text-secondary">Sin asignar</span>
                )}
              </TD>
              <TD
                className={`whitespace-nowrap ${overdue ? "font-medium text-danger-ink" : "text-text-secondary"}`}
              >
                {task.dueAt ? formatDate(task.dueAt) : "—"}
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
