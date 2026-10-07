import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as taskService from "@/src/server/tasks";
import {
  clientFullName,
  firstParam,
  listMemberOptions,
  type SearchParams,
} from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import { CreateTaskButton } from "@/src/components/tasks/create-task-button";
import { ClientTasksPanel } from "@/src/components/clients/client-tasks-panel";
import { AgencyClientShell } from "@/src/components/clients/agency-client-shell";
import { getOrganizationTimezone } from "@/src/server/org-timezone";

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
  const timezone = await getOrganizationTimezone(ctx.organizationId);
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
    <AgencyClientShell
      clientId={client.id}
      fullName={clientFullName(client)}
      status={client.status}
      title="Tareas"
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
    >
      <ClientTasksPanel
        clientId={client.id}
        tasks={tasks.items}
        members={members}
        canManage={canManage}
        timezone={timezone}
        cases={cases.map((c) => ({ id: c.id, caseCode: c.caseCode }))}
        scopedCaseId={scopedCase?.id ?? null}
        filterBasePath={`/crm/clientes/${client.id}/tareas`}
      />
    </AgencyClientShell>
  );
}
