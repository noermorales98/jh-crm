import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import * as clientService from "@/src/server/clients";
import { DomainError } from "@/src/server/errors";
import { Card, CardHeader, EmptyState, Pill } from "@/src/components/ui";
import { formatDateTime } from "@/src/lib/format";
import { ACTIVITY_TYPE_LABELS, labelFor } from "@/src/lib/labels";
import { ClientHeader } from "../client-header";

export const metadata: Metadata = {
  title: "Actividad del cliente",
};

export default async function ClientActivityPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client, timeline } = detail;

  return (
    <div>
      <ClientHeader client={client} />

      <Card>
        <CardHeader
          title="Línea de tiempo"
          description="Eventos de negocio del cliente: creaciones, cambios de etapa, rondas, tareas, documentos y pagos."
        />
        {timeline.length === 0 ? (
          <EmptyState
            icon={History}
            title="Sin actividad"
            description="Aún no hay eventos registrados para este cliente."
          />
        ) : (
          <ol className="relative ml-3 border-l border-border-subtle px-5 py-4">
            {timeline.map((event) => (
              <li key={event.id} className="relative mb-5 ml-4 last:mb-0">
                <span
                  aria-hidden
                  className="absolute -left-[1.42rem] top-1.5 size-2.5 rounded-full bg-action-primary ring-4 ring-nav-active"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="indigo">
                    {labelFor(ACTIVITY_TYPE_LABELS, event.type)}
                  </Pill>
                  <span className="text-xs text-text-secondary">
                    {formatDateTime(event.createdAt)}
                    {event.actor?.name ? ` · ${event.actor.name}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-secondary-strong">{event.description}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
