import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";

/**
 * NT-001 — Notas humanas en el cliente (historial de mensajes del lead).
 */
export async function createClientNote(
  ctx: OrganizationContext,
  data: {
    clientId: string;
    body: string;
    opportunityId?: string | null;
  },
) {
  const body = data.body.trim();
  if (!body) throw new DomainError("Escribe un mensaje.");

  const client = await prisma.client.findFirst({
    where: { id: data.clientId, organizationId: ctx.organizationId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  if (data.opportunityId) {
    const opp = await prisma.opportunity.findFirst({
      where: {
        id: data.opportunityId,
        clientId: client.id,
        organizationId: ctx.organizationId,
      },
      select: { id: true },
    });
    if (!opp) throw new DomainError("Oportunidad no encontrada.");
  }

  const note = await prisma.note.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: client.id,
      authorUserId: ctx.userId,
      body,
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true } },
    },
  });

  // Visibilidad en timeline de actividad del cliente (sin sustituir Note).
  await writeActivityLog(toActivityContext(ctx), {
    type: "NOTE",
    description: body,
    clientId: client.id,
    metadata: {
      noteId: note.id,
      opportunityId: data.opportunityId ?? null,
      source: "lead_message",
    },
  });

  return note;
}
