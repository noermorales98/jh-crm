import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { nextClientCode } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import { createNotification } from "@/src/server/notifications";
import { resolveAssigneeForOrg } from "@/src/server/users";

const CONTACT_SOURCE = "Sitio web";

export type ContactLeadInput = {
  name: string;
  email: string;
  phone: string;
  message: string;
};

function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? fullName.trim();
  const lastName = parts.slice(1).join(" ").trim() || null;
  return { firstName, lastName };
}

async function resolvePublicOrganizationId(): Promise<string> {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!org) {
    throw new DomainError("El formulario no está disponible ahora. Inténtalo más tarde.");
  }
  return org.id;
}

async function notifyNewLead(
  organizationId: string,
  client: { id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null },
) {
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: { in: ["OWNER", "ADMIN", "SPECIALIST", "STAFF"] },
      user: { isActive: true },
    },
    select: { userId: true },
  });
  if (members.length === 0) return;

  const fullName = [client.firstName, client.lastName].filter(Boolean).join(" ");
  const lines = [
    `Nombre: ${fullName}`,
    client.email ? `Correo: ${client.email}` : null,
    client.phone ? `Teléfono: ${client.phone}` : null,
  ].filter(Boolean);
  const body = lines.join("\n");
  const identity = (client.email ?? client.phone ?? client.id).toLowerCase();

  let sendWhatsapp = true;
  for (const member of members) {
    await createNotification({
      organizationId,
      userId: member.userId,
      type: "CONTACT_FORM",
      title: "Nuevo prospecto",
      body,
      link: `/crm/clientes/${client.id}`,
      dedupeKey: `contact:${organizationId}:${identity}:lead:${member.userId}`,
      skipWhatsapp: !sendWhatsapp,
    });
    sendWhatsapp = false;
  }
}

/**
 * Alta pública desde el formulario de `/`.
 * Crea un cliente LEAD; si el correo o teléfono ya existen, anota el
 * mensaje en el expediente y no vuelve a notificar.
 */
export async function submitContactLead(data: ContactLeadInput): Promise<{ created: boolean }> {
  const organizationId = await resolvePublicOrganizationId();
  const { firstName, lastName } = splitName(data.name);
  const email = data.email.toLowerCase();
  const phone = data.phone.trim();

  const existing = await prisma.client.findFirst({
    where: {
      organizationId,
      OR: [{ email }, { phone }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  });

  if (existing) {
    await writeActivityLog(
      { organizationId, actorUserId: null },
      {
        type: "NOTE",
        description: `Nueva consulta desde el sitio web:\n${data.message}`,
        clientId: existing.id,
        metadata: { source: CONTACT_SOURCE, email, phone },
      },
    );
    return { created: false };
  }

  const assigneeId = await resolveAssigneeForOrg(organizationId, null);
  const client = await prisma.$transaction(async (tx) => {
    const { code } = await nextClientCode(tx, organizationId);
    const created = await tx.client.create({
      data: {
        organizationId,
        clientCode: code,
        firstName,
        lastName,
        email,
        phone,
        source: CONTACT_SOURCE,
        status: "LEAD",
        assignedToId: assigneeId,
      },
    });
    await writeActivityLog(
      { organizationId, actorUserId: null },
      {
        type: "CREATED",
        description: `Prospecto ${created.clientCode} desde el sitio web: ${firstName} ${lastName ?? ""}`.trim(),
        clientId: created.id,
        metadata: { source: CONTACT_SOURCE, message: data.message },
      },
      tx,
    );
    await writeActivityLog(
      { organizationId, actorUserId: null },
      {
        type: "NOTE",
        description: `Consulta desde el sitio web:\n${data.message}`,
        clientId: created.id,
        metadata: { source: CONTACT_SOURCE },
      },
      tx,
    );
    return created;
  });

  try {
    await notifyNewLead(organizationId, client);
  } catch (error) {
    console.error(
      "[contact] no se pudo notificar el prospecto:",
      error instanceof Error ? error.message : "error",
    );
  }
  return { created: true };
}
