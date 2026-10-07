import Link from "next/link";
import { Card, CardHeader } from "@/src/components/ui";
import { CreateTaskButton } from "@/src/components/tasks/create-task-button";
import { TaskTable } from "@/src/components/tasks/task-table";

type CaseFilter = { id: string; caseCode: string };

export function ClientTasksPanel({
  clientId,
  tasks,
  members,
  canManage,
  timezone,
  cases = [],
  scopedCaseId = null,
  filterBasePath,
}: {
  clientId: string;
  tasks: Parameters<typeof TaskTable>[0]["tasks"];
  members: { id: string; name: string }[];
  canManage: boolean;
  timezone: string;
  cases?: CaseFilter[];
  scopedCaseId?: string | null;
  /** Si se pasa, muestra chips de filtro por caso (rutas con query). */
  filterBasePath?: string;
}) {
  const scoped = scopedCaseId
    ? (cases.find((c) => c.id === scopedCaseId) ?? null)
    : null;

  return (
    <div className="space-y-3">
      {filterBasePath && cases.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-text-secondary">Filtrar por servicio:</span>
          <Link
            href={filterBasePath}
            className={
              !scoped
                ? "font-medium text-action-primary"
                : "text-text-secondary hover:text-ink"
            }
          >
            Todos
          </Link>
          {cases.map((c) => (
            <Link
              key={c.id}
              href={`${filterBasePath}?caseId=${c.id}`}
              className={
                scoped?.id === c.id
                  ? "font-medium text-action-primary"
                  : "font-mono text-text-secondary hover:text-ink"
              }
            >
              {c.caseCode}
            </Link>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Tareas"
          description={
            scoped
              ? `Solo tareas del expediente ${scoped.caseCode}.`
              : "Pendientes y recientes ligadas a este cliente."
          }
          actions={
            canManage ? (
              <CreateTaskButton
                members={members}
                fixedClientId={clientId}
                fixedCaseId={scoped?.id}
                label="Nueva tarea"
              />
            ) : undefined
          }
        />
        <TaskTable
          tasks={tasks}
          members={members}
          canManage={canManage}
          showLinks={false}
          timezone={timezone}
          emptyAction={
            canManage ? (
              <CreateTaskButton
                members={members}
                fixedClientId={clientId}
                fixedCaseId={scoped?.id}
                label="Crear tarea"
              />
            ) : undefined
          }
        />
      </Card>
    </div>
  );
}
