import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/src/components/ui";
import { TaskDetailPanel } from "@/src/components/tasks/task-detail-panel";

export const metadata: Metadata = {
  title: "Detalle de tarea",
};

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Tarea"
        description={
          <Link
            href="/crm/tareas"
            className="text-action-primary hover:underline"
          >
            ← Volver a Pendientes
          </Link>
        }
      />
      <TaskDetailPanel taskId={taskId} />
    </div>
  );
}
