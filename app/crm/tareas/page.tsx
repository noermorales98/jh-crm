import type { Metadata } from "next";
import Link from "next/link";
import type { TaskStatus, TaskType } from "@prisma/client";
import { CheckCircle2, ChevronDown } from "lucide-react";
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

/** Estados del filtro general (completadas van en el desplegable). */
const OPEN_FILTER_STATUSES = ["PENDING", "IN_PROGRESS"] as TaskStatus[];
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

  const statusParam = parseEnumParam(
    firstParam(sp, "status"),
    OPEN_FILTER_STATUSES,
  );
  const status = statusParam;
  const type = parseEnumParam(firstParam(sp, "type"), TASK_TYPES);
  const assignedToId = firstParam(sp, "assignedTo");
  const due = parseEnumParam(firstParam(sp, "due"), DUE_VALUES);
  const cursor = firstParam(sp, "cursor");
  const canManage = can(ctx.role, "tasks.manage");

  const [result, completed, completedCount, typeCounts, members, clients] =
    await Promise.all([
      taskService.listTasks(ctx, { status, type, assignedToId, due, cursor }),
      taskService.listTasks(ctx, { status: "COMPLETED", limit: 40 }),
      taskService.countCompletedTasks(ctx),
      taskService.countOpenTasksByType(ctx),
      listMemberOptions(ctx),
      canManage
        ? clientService.listClients(ctx, { limit: 100 })
        : Promise.resolve({ items: [], nextCursor: null }),
    ]);

  const catalogChips = (
    [
      { type: "REQUEST_PAYMENT" as const, label: "Cobrar" },
      { type: "REQUEST_DOCUMENT" as const, label: "Docs" },
      { type: "FOLLOW_UP" as const, label: "Seguimiento" },
      { type: "REVIEW_RESULT" as const, label: "Revisión" },
      { type: "CALL" as const, label: "Llamada" },
      { type: "PREPARE_ROUND" as const, label: "Ronda" },
    ] as const
  ).filter((c) => (typeCounts[c.type] ?? 0) > 0);

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

      {catalogChips.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2 px-0.5" role="list" aria-label="Catálogo por tipo">
          <Link
            href="/crm/tareas"
            role="listitem"
            className={`inline-flex min-h-9 items-center rounded-full px-3 text-[13px] font-medium ring-1 transition-colors ${
              !type
                ? "bg-action-primary text-action-primary-foreground ring-action-primary"
                : "bg-surface-elevated text-text-secondary ring-border-subtle/60 hover:bg-nav-hover hover:text-ink"
            }`}
          >
            Todas
          </Link>
          {catalogChips.map((chip) => {
            const count = typeCounts[chip.type] ?? 0;
            const active = type === chip.type;
            const href = `/crm/tareas?type=${chip.type}`;
            return (
              <Link
                key={chip.type}
                href={href}
                role="listitem"
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ring-1 transition-colors ${
                  active
                    ? "bg-action-primary text-action-primary-foreground ring-action-primary"
                    : "bg-surface-elevated text-ink ring-border-subtle/60 hover:bg-nav-hover"
                }`}
              >
                {chip.label}
                <span className={`tabular-nums ${active ? "opacity-90" : "text-text-secondary"}`}>
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

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
              options={OPEN_FILTER_STATUSES.map((s) => ({
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
          showWorkBadges
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

      {completedCount > 0 ? (
        <details className="group mt-4 overflow-hidden rounded-[14px] bg-surface-elevated ring-1 ring-border-subtle/50 open:ring-border-subtle/70">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-nav-hover sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2.5 text-[14px] text-ink">
              <CheckCircle2
                className="size-4 shrink-0 text-success-ink"
                aria-hidden
              />
              <span>
                <span className="font-semibold tabular-nums">
                  {completedCount}
                </span>
                {completedCount === 1
                  ? " tarea completada"
                  : " tareas completadas"}
              </span>
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-text-secondary transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden
            />
          </summary>
          <div className="border-t border-border-subtle/60">
            <TaskTable
              tasks={completed.items}
              members={members}
              canManage={canManage}
            />
            {completedCount > completed.items.length ? (
              <p className="border-t border-border-subtle/40 px-4 py-3 text-[12px] text-text-secondary sm:px-5">
                Mostrando las {completed.items.length} más recientes de{" "}
                {completedCount}.
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
