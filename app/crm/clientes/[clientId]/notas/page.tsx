import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as notesService from "@/src/server/notes";
import { DomainError } from "@/src/server/errors";
import { clientFullName } from "@/src/server/page-helpers";
import { ClientNotesPanel } from "@/src/components/clients/client-notes-panel";
import { AgencyClientShell } from "@/src/components/clients/agency-client-shell";

export const metadata: Metadata = {
  title: "Notas del cliente",
};

export default async function ClientNotesPage({
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
  const canEdit = can(ctx.role, "clients.edit");
  const notes = await notesService.listClientNotes(ctx, client.id, {
    limit: 80,
  });

  return (
    <AgencyClientShell
      clientId={client.id}
      fullName={clientFullName(client)}
      status={client.status}
      title="Notas"
    >
      <ClientNotesPanel
        clientId={client.id}
        notes={notes}
        canEdit={canEdit}
      />
    </AgencyClientShell>
  );
}
