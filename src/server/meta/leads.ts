import { Prisma, type LeadChannel } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { nextClientCode } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import { createNotification } from "@/src/server/notifications";
import { resolveAssigneeForOrg } from "@/src/server/users";
import { onNewLead } from "@/src/server/automations";
import { createOpportunity } from "@/src/server/opportunities";
import type { OrganizationContext } from "@/src/server/auth/guards";

const META_SOURCE = "META";

export type MetaLeadInput = {
  externalLeadId: string;
  pageId?: string | null;
  formId?: string | null;
  adId?: string | null;
  adsetId?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  fieldData?: Record<string, unknown> | unknown[] | null;
};

export type MetaLeadResult = {
  created: boolean;
  deduped: boolean;
  disabled?: boolean;
  clientId: string | null;
  opportunityId: string | null;
  eventId: string | null;
};

function isMetaLeadAdsEnabled(): boolean {
  return process.env.FEATURE_META_LEAD_ADS === "true";
}

function emptyToNull(v?: string | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? fullName.trim();
  const lastName = parts.slice(1).join(" ").trim() || null;
  return { firstName, lastName };
}

function fieldValue(
  fieldData: MetaLeadInput["fieldData"],
  ...keys: string[]
): string | null {
  if (!fieldData) return null;
  const wanted = new Set(keys.map((k) => k.toLowerCase()));

  if (Array.isArray(fieldData)) {
    for (const row of fieldData) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const name = String(rec.name ?? "").toLowerCase();
      if (!wanted.has(name)) continue;
      const values = rec.values;
      if (Array.isArray(values) && values[0] != null) {
        return String(values[0]).trim() || null;
      }
      if (typeof rec.value === "string") return rec.value.trim() || null;
    }
    return null;
  }

  if (typeof fieldData === "object") {
    for (const key of Object.keys(fieldData)) {
      if (!wanted.has(key.toLowerCase())) continue;
      const raw = (fieldData as Record<string, unknown>)[key];
      if (Array.isArray(raw) && raw[0] != null) return String(raw[0]).trim() || null;
      if (raw != null) return String(raw).trim() || null;
    }
  }
  return null;
}

function inferMetaChannel(input: MetaLeadInput): LeadChannel {
  const hay = [
    input.pageId,
    input.formId,
    input.campaignName,
    input.campaignId,
    JSON.stringify(input.fieldData ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\b(instagram|ig)\b/.test(hay)) return "INSTAGRAM";
  return "FACEBOOK";
}

function buildAttribution(input: MetaLeadInput): Prisma.InputJsonValue {
  const attr: Record<string, string> = {
    utm_source: "meta",
    utm_medium: "lead_ads",
  };
  if (input.campaignId) attr.utm_campaign = input.campaignId;
  if (input.campaignName) attr.campaign_name = input.campaignName;
  if (input.adsetId) attr.adset_id = input.adsetId;
  if (input.adId) attr.ad_id = input.adId;
  if (input.formId) attr.form_id = input.formId;
  if (input.pageId) attr.page_id = input.pageId;
  if (input.externalLeadId) attr.leadgen_id = input.externalLeadId;
  // fbclid-style: usamos leadgen_id como identificador de click Meta.
  attr.fbclid = `meta_lead_${input.externalLeadId}`;
  return attr;
}

async function resolvePublicOrganizationId(): Promise<string> {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!org) {
    throw new DomainError("Meta Lead Ads no está disponible ahora. Inténtalo más tarde.");
  }
  return org.id;
}

async function notifyMetaLead(
  organizationId: string,
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  },
  externalLeadId: string,
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
  const body = [
    `Nombre: ${fullName}`,
    client.email ? `Correo: ${client.email}` : null,
    client.phone ? `Teléfono: ${client.phone}` : null,
    `Lead Meta: ${externalLeadId}`,
  ]
    .filter(Boolean)
    .join("\n");

  let sendWhatsapp = true;
  for (const member of members) {
    await createNotification({
      organizationId,
      userId: member.userId,
      type: "META_LEAD",
      title: "Nuevo lead de Meta",
      body,
      link: `/crm/clientes/${client.id}`,
      dedupeKey: `meta:${organizationId}:${externalLeadId}:lead:${member.userId}`,
      skipWhatsapp: !sendWhatsapp,
    });
    sendWhatsapp = false;
  }
}

/**
 * Procesa un lead de Meta Lead Ads (idempotente por organizationId + externalLeadId).
 * Requiere FEATURE_META_LEAD_ADS=true.
 */
export async function processMetaLead(
  input: MetaLeadInput,
): Promise<MetaLeadResult> {
  if (!isMetaLeadAdsEnabled()) {
    throw new DomainError(
      "Meta Lead Ads está desactivado. Activa FEATURE_META_LEAD_ADS=true.",
    );
  }

  const externalLeadId = emptyToNull(input.externalLeadId);
  if (!externalLeadId) {
    throw new DomainError("externalLeadId es obligatorio.");
  }

  const organizationId = await resolvePublicOrganizationId();

  const existingEvent = await prisma.metaLeadEvent.findUnique({
    where: {
      organizationId_externalLeadId: { organizationId, externalLeadId },
    },
    select: {
      id: true,
      clientId: true,
      opportunityId: true,
    },
  });
  if (existingEvent) {
    return {
      created: false,
      deduped: true,
      clientId: existingEvent.clientId,
      opportunityId: existingEvent.opportunityId,
      eventId: existingEvent.id,
    };
  }

  const emailFromFields = fieldValue(
    input.fieldData,
    "email",
    "email_address",
    "work_email",
  );
  const phoneFromFields = fieldValue(
    input.fieldData,
    "phone",
    "phone_number",
    "mobile",
    "mobile_number",
  );
  const fullNameFromFields = fieldValue(
    input.fieldData,
    "full_name",
    "fullname",
  );
  const firstFromFields = fieldValue(input.fieldData, "first_name", "firstname");
  const lastFromFields = fieldValue(input.fieldData, "last_name", "lastname");

  const email = emptyToNull(input.email)?.toLowerCase() ?? emailFromFields?.toLowerCase() ?? null;
  const phone = emptyToNull(input.phone) ?? phoneFromFields;
  let firstName = emptyToNull(input.firstName) ?? firstFromFields;
  let lastName = emptyToNull(input.lastName) ?? lastFromFields;
  const fullName = emptyToNull(input.fullName) ?? fullNameFromFields;
  if ((!firstName || !lastName) && fullName) {
    const split = splitName(fullName);
    firstName = firstName ?? split.firstName;
    lastName = lastName ?? split.lastName;
  }
  if (!firstName) firstName = "Lead";
  if (!email && !phone) {
    throw new DomainError("El lead de Meta necesita al menos correo o teléfono.");
  }

  const leadChannel = inferMetaChannel(input);
  const attribution = buildAttribution(input);
  const campaign =
    emptyToNull(input.campaignName) ?? emptyToNull(input.campaignId);

  const assigneeId = await resolveAssigneeForOrg(organizationId, null);

  const orFilters: Prisma.ClientWhereInput[] = [];
  if (email) orFilters.push({ email });
  if (phone) orFilters.push({ phone });

  let client = orFilters.length
    ? await prisma.client.findFirst({
        where: { organizationId, OR: orFilters },
        orderBy: { createdAt: "asc" },
      })
    : null;

  let clientCreated = false;

  if (client) {
    client = await prisma.client.update({
      where: { id: client.id },
      data: {
        email: client.email ?? email,
        phone: client.phone ?? phone,
        firstName: client.firstName || firstName,
        lastName: client.lastName ?? lastName,
        source: client.source ?? META_SOURCE,
        leadChannel: client.leadChannel === "OTHER" || !client.leadChannel
          ? leadChannel
          : client.leadChannel,
        attribution,
        ...(assigneeId && !client.assignedToId
          ? { assignedToId: assigneeId }
          : {}),
      },
    });
    await writeActivityLog(
      { organizationId, actorUserId: null },
      {
        type: "NOTE",
        description: `Lead Meta actualizado (leadgen ${externalLeadId}).`,
        clientId: client.id,
        metadata: {
          source: META_SOURCE,
          externalLeadId,
          pageId: input.pageId,
          formId: input.formId,
          adId: input.adId,
          adsetId: input.adsetId,
          campaignId: input.campaignId,
        },
      },
    );
  } else {
    client = await prisma.$transaction(async (tx) => {
      const { code } = await nextClientCode(tx, organizationId);
      const created = await tx.client.create({
        data: {
          organizationId,
          clientCode: code,
          firstName,
          lastName,
          email,
          phone,
          source: META_SOURCE,
          leadChannel,
          attribution,
          status: "LEAD",
          assignedToId: assigneeId,
        },
      });
      await writeActivityLog(
        { organizationId, actorUserId: null },
        {
          type: "CREATED",
          description: `Prospecto ${created.clientCode} desde Meta Lead Ads.`,
          clientId: created.id,
          metadata: {
            source: META_SOURCE,
            externalLeadId,
            leadChannel,
          },
        },
        tx,
      );
      return created;
    });
    clientCreated = true;
  }

  const ownerUserId =
    assigneeId ??
    (
      await prisma.organizationMember.findFirst({
        where: {
          organizationId,
          role: { in: ["OWNER", "ADMIN"] },
          user: { isActive: true },
        },
        orderBy: { createdAt: "asc" },
        select: { userId: true },
      })
    )?.userId;

  if (!ownerUserId) {
    throw new DomainError("No hay usuario activo para asignar la oportunidad.");
  }

  const staffCtx: OrganizationContext = {
    organizationId,
    userId: ownerUserId,
    role: "OWNER",
  };

  const opportunity = await createOpportunity(staffCtx, {
    clientId: client.id,
    ownerId: ownerUserId,
    stage: "NEW_LEAD",
    source: META_SOURCE,
    campaign,
  });

  try {
    await onNewLead(organizationId, client.id);
  } catch (error) {
    console.error(
      "[meta] automatización onNewLead:",
      error instanceof Error ? error.message : "error",
    );
  }

  try {
    await notifyMetaLead(organizationId, client, externalLeadId);
  } catch (error) {
    console.error(
      "[meta] no se pudo notificar el lead:",
      error instanceof Error ? error.message : "error",
    );
  }

  const event = await prisma.metaLeadEvent.create({
    data: {
      organizationId,
      externalLeadId,
      pageId: emptyToNull(input.pageId),
      formId: emptyToNull(input.formId),
      adId: emptyToNull(input.adId),
      adsetId: emptyToNull(input.adsetId),
      campaignId: emptyToNull(input.campaignId),
      clientId: client.id,
      opportunityId: opportunity.id,
      payloadJson: {
        fullName,
        firstName,
        lastName,
        email,
        phone,
        fieldData: input.fieldData ?? null,
        campaignName: input.campaignName ?? null,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    created: clientCreated,
    deduped: false,
    clientId: client.id,
    opportunityId: opportunity.id,
    eventId: event.id,
  };
}

export { isMetaLeadAdsEnabled };
