import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as notesService from "@/src/server/notes";
import { listClientActivityEvents } from "@/src/server/activity";
import { DomainError } from "@/src/server/errors";
import { clientFullName } from "@/src/server/page-helpers";
import { Card, CardBody, CardHeader } from "@/src/components/ui";
import { ClientNotesPanel } from "@/src/components/clients/client-notes-panel";
import { ActivityTimeline } from "@/src/components/clients/activity-timeline";
import { AgencyClientShell } from "@/src/components/clients/agency-client-shell";

export const metadata: Metadata = {
  title: "Actividad del cliente",
};

/** Notas + historial en una sola pestaña (antes: Actividad y Notas). */
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

  const { client } = detail;
  const fullName = clientFullName(client);
  const canEdit = can(ctx.role, "clients.edit");
  const [notes, events] = await Promise.all([
    notesService.listClientNotes(ctx, client.id, { limit: 80 }),
    listClientActivityEvents(ctx.organizationId, client.id),
  ]);

  return (
    <AgencyClientShell
      clientId={client.id}
      fullName={fullName}
      status={client.status}
      title="Actividad"
    >
      <div className="space-y-4">
        <ClientNotesPanel clientId={client.id} notes={notes} canEdit={canEdit} />
        <Card>
          <CardHeader title="Historial" compact />
          <CardBody className="px-4 py-3">
            {events.length > 0 ? (
              <ActivityTimeline clientId={client.id} clientName={fullName} events={events} />
            ) : (
              <p className="text-sm text-text-secondary">Sin actividad registrada.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </AgencyClientShell>
  );
}
