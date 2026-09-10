import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as taskService from "@/src/server/tasks";
import {
  firstParam,
  listMemberOptions,
  type SearchParams,
} from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import { Card, CardHeader } from "@/src/components/ui";
import { CreateTaskButton } from "@/src/components/tasks/create-task-button";
import { TaskTable } from "@/src/components/tasks/task-table";
import { ClientHeader } from "../client-header";

export const metadata: Metadata = {
  title: "Tareas del cliente",
};

export default async function ClientTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: SearchParams;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const caseId = firstParam(sp, "caseId");
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client, cases } = detail;
  const canManage = can(ctx.role, "tasks.manage");
  const scopedCase =
    caseId && cases.some((c) => c.id === caseId)
      ? cases.find((c) => c.id === caseId)!
      : null;

  const [tasks, members] = await Promise.all([
    taskService.listTasks(ctx, {
      clientId: scopedCase ? undefined : client.id,
      caseId: scopedCase?.id,
      serviceCaseId: scopedCase?.serviceCaseId ?? undefined,
      limit: 50,
    }),
    canManage ? listMemberOptions(ctx) : Promise.resolve([]),
  ]);

  return (
    <div>
      <ClientHeader
        client={client}
        actions={
          canManage ? (
            <CreateTaskButton
              members={members}
              fixedClientId={client.id}
              fixedCaseId={scopedCase?.id}
              label="Nueva tarea"
            />
          ) : null
        }
        meta={
          cases.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-text-secondary">Filtrar por servicio:</span>
              <Link
                href={`/crm/clientes/${client.id}/tareas`}
                className={
                  !scopedCase
                    ? "font-medium text-action-primary"
                    : "text-text-secondary hover:text-ink"
                }
              >
                Todos
              </Link>
              {cases.map((c) => (
                <Link
                  key={c.id}
                  href={`/crm/clientes/${client.id}/tareas?caseId=${c.id}`}
                  className={
                    scopedCase?.id === c.id
                      ? "font-medium text-action-primary"
                      : "font-mono text-text-secondary hover:text-ink"
                  }
                >
                  {c.caseCode}
                </Link>
              ))}
            </div>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Tareas"
          description={
            scopedCase
              ? `Solo tareas del expediente ${scopedCase.caseCode}.`
              : "Pendientes y recientes ligadas a este cliente."
          }
        />
        <TaskTable
          tasks={tasks.items}
          members={members}
          canManage={canManage}
          showLinks={false}
          emptyAction={
            canManage ? (
              <CreateTaskButton
                members={members}
                fixedClientId={client.id}
                fixedCaseId={scopedCase?.id}
                label="Crear tarea"
              />
            ) : undefined
          }
        />
      </Card>
    </div>
  );
}
