import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as taskService from "@/src/server/tasks";
import { listMemberOptions, clientFullName } from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import { Card, CardBody, CardHeader, StatusPill } from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { TASK_TYPE_LABELS, labelFor } from "@/src/lib/labels";
import { TaskRowActions } from "@/src/components/tasks/task-row-actions";

export async function TaskDetailPanel({ taskId }: { taskId: string }) {
  const ctx = await requireOrganization();
  let task: Awaited<ReturnType<typeof taskService.getTask>>;
  try {
    task = await taskService.getTask(ctx, taskId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const canManage = can(ctx.role, "tasks.manage");
  const open = task.status === "PENDING" || task.status === "IN_PROGRESS";
  const members = canManage ? await listMemberOptions(ctx) : [];
  const overdue =
    task.dueAt &&
    new Date(task.dueAt) < new Date() &&
    open;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">{task.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill domain="taskStatus" value={task.status} />
          <StatusPill domain="taskPriority" value={task.priority} />
        </div>
      </div>

      <Card>
        <CardHeader title="Detalle" />
        <CardBody>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Tipo</dt>
              <dd>{labelFor(TASK_TYPE_LABELS, task.type)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Vencimiento</dt>
              <dd className={overdue ? "font-medium text-red-600" : ""}>
                {task.dueAt ? formatDate(task.dueAt) : "—"}
                {overdue ? " · vencida" : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Recordatorio</dt>
              <dd>{task.reminderAt ? formatDate(task.reminderAt) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Responsable</dt>
              <dd>{task.assignedTo?.name ?? "Sin asignar"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Cliente</dt>
              <dd>
                {task.client ? (
                  <Link
                    href={`/crm/clientes?id=${task.client.id}`}
                    className="text-action-primary hover:text-action-secondary"
                  >
                    {clientFullName(task.client)}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Caso</dt>
              <dd>
                {task.case ? (
                  <Link
                    href={`/crm/casos?id=${task.case.id}`}
                    className="text-action-primary hover:text-action-secondary"
                  >
                    {task.case.caseCode}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
          {task.description ? (
            <p className="mt-4 whitespace-pre-wrap text-sm text-text-secondary-strong">
              {task.description}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {canManage && open ? (
        <TaskRowActions
          taskId={task.id}
          members={members}
          currentAssigneeId={task.assignedTo?.id ?? null}
        />
      ) : null}
    </div>
  );
}
