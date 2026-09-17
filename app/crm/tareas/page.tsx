import type { Metadata } from "next";
import type { TaskStatus, TaskType } from "@prisma/client";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as taskService from "@/src/server/tasks";
import * as clientService from "@/src/server/clients";
import type { TaskDueFilter } from "@/src/server/tasks";
import {
  clientFullName,
  firstParam,
  listMemberOptions,
  parseEnumParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  Card,
  CursorPagination,
  FilterBar,
  FilterSelect,
  ListToolbar,
  PageHeader,
} from "@/src/components/ui";
import {
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from "@/src/lib/labels";
import { CreateTaskButton } from "@/src/components/tasks/create-task-button";
import { TaskTable } from "@/src/components/tasks/task-table";

export const metadata: Metadata = {
  title: "Pendientes",
};

const TASK_STATUSES = Object.keys(TASK_STATUS_LABELS) as TaskStatus[];
const TASK_TYPES = Object.keys(TASK_TYPE_LABELS) as TaskType[];
const DUE_FILTERS: { value: TaskDueFilter; label: string }[] = [
  { value: "overdue", label: "Vencidas" },
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta semana" },
];
const DUE_VALUES = DUE_FILTERS.map((d) => d.value);

export default async function TasksPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;

  const status = parseEnumParam(firstParam(sp, "status"), TASK_STATUSES);
  const type = parseEnumParam(firstParam(sp, "type"), TASK_TYPES);
  const assignedToId = firstParam(sp, "assignedTo");
  const due = parseEnumParam(firstParam(sp, "due"), DUE_VALUES);
  const cursor = firstParam(sp, "cursor");
  const canManage = can(ctx.role, "tasks.manage");

  const [result, members, clients] = await Promise.all([
    taskService.listTasks(ctx, { status, type, assignedToId, due, cursor }),
    listMemberOptions(ctx),
    // Opciones de cliente para el formulario de creación (sin archivados).
    canManage
      ? clientService.listClients(ctx, { limit: 100 })
      : Promise.resolve({ items: [], nextCursor: null }),
  ]);

  const clientOptions = clients.items
    .filter((c) => c.status !== "ARCHIVED")
    .map((c) => ({
      id: c.id,
      label: `${clientFullName(c)} (${c.clientCode})`,
    }));

  return (
    <div>
      <PageHeader
        title="Pendientes"
        description="Lo que tienes pendiente: vencidas, de hoy y de esta semana."
        actions={
          canManage ? (
            <CreateTaskButton members={members} clients={clientOptions} />
          ) : null
        }
      />

      <ListToolbar
        filters={
          <FilterBar>
            <FilterSelect
              name="due"
              label="Vencimiento"
              options={DUE_FILTERS}
              allLabel="Todas las fechas"
            />
            <FilterSelect
              name="status"
              label="Estado"
              options={TASK_STATUSES.map((s) => ({
                value: s,
                label: TASK_STATUS_LABELS[s],
              }))}
            />
            <FilterSelect
              name="type"
              label="Tipo"
              options={TASK_TYPES.map((t) => ({
                value: t,
                label: TASK_TYPE_LABELS[t],
              }))}
            />
            <FilterSelect
              name="assignedTo"
              label="Responsable"
              options={members.map((m) => ({ value: m.id, label: m.name }))}
            />
          </FilterBar>
        }
      />

      <Card>
        <TaskTable
          tasks={result.items}
          members={members}
          canManage={canManage}
          emptyAction={
            canManage ? (
              <CreateTaskButton members={members} clients={clientOptions} />
            ) : null
          }
        />

        <CursorPagination
          pathname="/crm/tareas"
          params={{
            status,
            type,
            assignedTo: assignedToId,
            due,
            back: firstParam(sp, "back"),
          }}
          cursor={cursor}
          nextCursor={result.nextCursor}
        />
      </Card>
    </div>
  );
}
