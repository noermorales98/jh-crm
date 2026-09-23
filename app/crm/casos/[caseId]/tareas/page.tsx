import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as caseService from "@/src/server/cases";
import * as taskService from "@/src/server/tasks";
import { listMemberOptions } from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import { Card, CardHeader } from "@/src/components/ui";
import { CreateTaskButton } from "@/src/components/tasks/create-task-button";
import { TaskTable } from "@/src/components/tasks/task-table";
import { CaseHeader } from "../case-header";
import { getOrganizationTimezone } from "@/src/server/org-timezone";

export const metadata: Metadata = {
  title: "Tareas del caso",
};

export default async function CaseTasksPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof caseService.getCaseDetail>>;
  try {
    detail = await caseService.getCaseDetail(ctx, caseId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { case: creditCase } = detail;
  const canManage = can(ctx.role, "tasks.manage");
  const timezone = await getOrganizationTimezone(ctx.organizationId);

  const [tasks, members] = await Promise.all([
    taskService.listTasks(ctx, { caseId: creditCase.id, limit: 50 }),
    canManage ? listMemberOptions(ctx) : Promise.resolve([]),
  ]);

  return (
    <div>
      <CaseHeader
        creditCase={creditCase}
        actions={
          canManage ? (
            <CreateTaskButton
              members={members}
              fixedClientId={creditCase.client.id}
              fixedCaseId={creditCase.id}
            />
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Tareas del caso"
          description="Seguimiento, solicitudes de documentos y revisiones ligadas a este caso."
        />
        <TaskTable
          tasks={tasks.items}
          members={members}
          canManage={canManage}
          timezone={timezone}
        />
      </Card>
    </div>
  );
}
