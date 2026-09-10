import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StickyNote } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as notesService from "@/src/server/notes";
import { DomainError } from "@/src/server/errors";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from "@/src/components/ui";
import { formatDateTime } from "@/src/lib/format";
import { ClientNoteForm } from "@/src/components/clients/client-note-form";
import { ClientHeader } from "../client-header";

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
    <div>
      <ClientHeader client={client} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {canEdit ? (
          <Card>
            <CardHeader title="Agregar nota" compact />
            <CardBody className="px-4 py-3">
              <ClientNoteForm clientId={client.id} />
            </CardBody>
          </Card>
        ) : null}

        <Card className={canEdit ? undefined : "lg:col-span-2"}>
          <CardHeader
            title="Historial"
            description="Notas humanas (separadas del timeline de sistema)."
          />
          {notes.length === 0 ? (
            <EmptyState
              icon={StickyNote}
              title="Sin notas"
              description="Las notas internas del cliente aparecerán aquí."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {notes.map((note) => (
                <li key={note.id} className="px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                    {note.body}
                  </p>
                  <p className="mt-1.5 text-[11px] tabular-nums text-text-secondary">
                    {formatDateTime(note.createdAt)}
                    {note.author.name ? ` · ${note.author.name}` : ""}
                    {note.serviceCase
                      ? ` · ${note.serviceCase.caseNumber}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
