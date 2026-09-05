import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { nextClientCode } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import { createNotification } from "@/src/server/notifications";
import { resolveAssigneeForOrg } from "@/src/server/users";
import { requestConsultation } from "@/src/server/consultations";
import { onNewLead } from "@/src/server/automations";
import {
  inferLeadChannel,
  normalizeAttribution,
  type AttributionPayload,
} from "@/src/lib/attribution";

const CONTACT_SOURCE = "Sitio web";

export type ContactLeadInput = {
  name: string;
  email: string;
  phone: string;
  message: string;
  serviceRequested?: string | null;
  state?: string | null;
  preferredContactMethod?: string | null;
  preferredContactTime?: string | null;
  /** Consentimiento SMS opcional (se guarda en attribution.sms_consent). */
  smsConsent?: boolean;
  attribution?: AttributionPayload | Record<string, unknown> | null;
};

export type ContactLeadResult = {
  created: boolean;
  clientId: string;
  consultationId: string | null;
  /** Mensaje seguro para la UI pública — nunca implica PAID. */
  message: string;
};

function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? fullName.trim();
  const lastName = parts.slice(1).join(" ").trim() || null;
  return { firstName, lastName };
}

function emptyToNull(v?: string | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length ? t : null;
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

async function createConsultationForLead(
  organizationId: string,
  clientId: string,
  message: string,
): Promise<string | null> {
  try {
    const consultation = await requestConsultation(
      { organizationId, userId: null },
      {
        clientId,
        amount: 1,
        notes: message.slice(0, 2000),
      },
    );
    return consultation.id;
  } catch (error) {
    console.error(
      "[contact] no se pudo crear la consulta:",
      error instanceof Error ? error.message : "error",
    );
    return null;
  }
}

/**
 * Alta pública desde el formulario de `/`.
 * Crea un cliente LEAD; si el correo o teléfono ya existen, anota el
 * mensaje en el expediente. Siempre crea Consultation REQUESTED ($1)
 * y responde "Solicitud recibida" (nunca PAID).
 */
export async function submitContactLead(
  data: ContactLeadInput,
): Promise<ContactLeadResult> {
  const organizationId = await resolvePublicOrganizationId();
  const { firstName, lastName } = splitName(data.name);
  const email = data.email.toLowerCase();
  const phone = data.phone.trim();
  const attribution = normalizeAttribution({
    ...(data.attribution ?? {}),
    sms_consent: data.smsConsent === true,
  });
  const leadChannel = inferLeadChannel(attribution, CONTACT_SOURCE);
  const sourceDerived =
    attribution.utm_source?.trim() ||
    attribution.utm_campaign?.trim() ||
    CONTACT_SOURCE;
  const publicMessage =
    "Solicitud recibida. No se ha cobrado ningún pago. Te contactaremos pronto.";

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
        metadata: {
          source: CONTACT_SOURCE,
          email,
          phone,
          attribution,
          leadChannel,
        },
      },
    );
    if (Object.keys(attribution).length > 0) {
      const current = await prisma.client.findUnique({
        where: { id: existing.id },
        select: { attribution: true },
      });
      const prev =
        current?.attribution &&
        typeof current.attribution === "object" &&
        !Array.isArray(current.attribution)
          ? (current.attribution as Record<string, unknown>)
          : {};
      await prisma.client.update({
        where: { id: existing.id },
        data: {
          attribution: {
            ...prev,
            ...attribution,
          } as Prisma.InputJsonValue,
        },
      });
    }
    const consultationId = await createConsultationForLead(
      organizationId,
      existing.id,
      data.message,
    );
    return {
      created: false,
      clientId: existing.id,
      consultationId,
      message: publicMessage,
    };
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
        state: emptyToNull(data.state),
        source: sourceDerived,
        leadChannel,
        serviceRequested: emptyToNull(data.serviceRequested),
        preferredContactMethod: emptyToNull(data.preferredContactMethod),
        preferredContactTime: emptyToNull(data.preferredContactTime),
        attribution:
          Object.keys(attribution).length > 0
            ? (attribution as Prisma.InputJsonValue)
            : undefined,
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
        metadata: {
          source: sourceDerived,
          message: data.message,
          leadChannel,
          attribution,
        },
      },
      tx,
    );
    await writeActivityLog(
      { organizationId, actorUserId: null },
      {
        type: "NOTE",
        description: `Consulta desde el sitio web:\n${data.message}`,
        clientId: created.id,
        metadata: { source: CONTACT_SOURCE, leadChannel },
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

  try {
    await onNewLead(organizationId, client.id);
  } catch (error) {
    console.error(
      "[contact] automatización onNewLead:",
      error instanceof Error ? error.message : "error",
    );
  }

  const consultationId = await createConsultationForLead(
    organizationId,
    client.id,
    data.message,
  );

  return {
    created: true,
    clientId: client.id,
    consultationId,
    message: publicMessage,
  };
}
