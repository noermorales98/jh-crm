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

export async function listClientNotes(
  ctx: OrganizationContext,
  clientId: string,
  opts: { limit?: number } = {},
) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  const limit = Math.min(opts.limit ?? 50, 100);
  return prisma.note.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId: client.id,
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      serviceCaseId: true,
      author: { select: { id: true, name: true } },
      serviceCase: {
        select: { id: true, caseNumber: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * NT-001 — Nota humana en el expediente (ServiceCase).
 * `caseId` es el CreditCase visible en la UI; la nota cuelga de su ServiceCase.
 */
export async function createServiceCaseNote(
  ctx: OrganizationContext,
  data: {
    caseId: string;
    body: string;
  },
) {
  const body = data.body.trim();
  if (!body) throw new DomainError("Escribe una nota.");

  const creditCase = await prisma.creditCase.findFirst({
    where: { id: data.caseId, organizationId: ctx.organizationId },
    select: { id: true, clientId: true, serviceCaseId: true, caseCode: true },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");

  const note = await prisma.note.create({
    data: {
      organizationId: ctx.organizationId,
      clientId: creditCase.clientId,
      serviceCaseId: creditCase.serviceCaseId,
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

  await writeActivityLog(toActivityContext(ctx), {
    type: "NOTE",
    description: `Nota en expediente ${creditCase.caseCode}: ${body.length > 120 ? `${body.slice(0, 120)}…` : body}`,
    clientId: creditCase.clientId,
    caseId: creditCase.id,
    serviceCaseId: creditCase.serviceCaseId,
    metadata: { noteId: note.id, source: "service_case_note" },
  });

  return note;
}
