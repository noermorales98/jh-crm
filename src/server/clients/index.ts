import type { ClientStatus, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { decrypt, encrypt, maskSSN, ssnLast4 } from "@/src/lib/security/encryption";
import { DomainError } from "@/src/server/errors";
import { nextClientCode } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import { writeAuditLog } from "@/src/server/audit";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext, toAuditContext } from "@/src/server/context";
import { resolveAssigneeForOrg } from "@/src/server/users";

/**
 * Servicio de clientes. Toda query está scopeada por organizationId
 * (obtenido exclusivamente de requireOrganization en la capa superior).
 */

export interface ClientCreateData {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  source?: string | null;
  status?: ClientStatus;
  assignedToId?: string | null;
}

export interface ClientListFilters {
  q?: string;
  status?: ClientStatus;
  assignedToId?: string;
  cursor?: string;
  limit?: number;
}

const CLIENT_LIST_SELECT = {
  id: true,
  clientCode: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  city: true,
  state: true,
  status: true,
  source: true,
  assignedToId: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true, email: true } },
  sensitive: { select: { ssnLast4: true } },
} satisfies Prisma.ClientSelect;

function emptyToNull<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value === "" ? null : value;
  }
  return out as T;
}

async function assertMember(
  ctx: OrganizationContext,
  userId: string,
): Promise<void> {
  const member = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: { userId, organizationId: ctx.organizationId },
    },
    include: { user: { select: { isActive: true } } },
  });
  if (!member || !member.user.isActive) {
    throw new DomainError("El responsable seleccionado no es un miembro activo de la organización.");
  }
}

async function getClientOrThrow(ctx: OrganizationContext, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");
  return client;
}

export async function createClient(ctx: OrganizationContext, data: ClientCreateData) {
  const clean = emptyToNull({ ...data });
  const assigneeId = await resolveAssigneeForOrg(
    ctx.organizationId,
    (clean.assignedToId as string | null) ?? null,
  );
  if (assigneeId) await assertMember(ctx, assigneeId);

  return prisma.$transaction(async (tx) => {
    const { code } = await nextClientCode(tx, ctx.organizationId);
    const client = await tx.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: code,
        firstName: clean.firstName as string,
        lastName: (clean.lastName as string | null) ?? null,
        email: (clean.email as string | null) ?? null,
        phone: (clean.phone as string | null) ?? null,
        addressLine1: (clean.addressLine1 as string | null) ?? null,
        addressLine2: (clean.addressLine2 as string | null) ?? null,
        city: (clean.city as string | null) ?? null,
        state: (clean.state as string | null) ?? null,
        postalCode: (clean.postalCode as string | null) ?? null,
        country: (clean.country as string | null) ?? "US",
        source: (clean.source as string | null) ?? null,
        status: clean.status ?? "LEAD",
        assignedToId: assigneeId,
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "CREATED",
        description: `Cliente ${client.clientCode} creado: ${client.firstName} ${client.lastName ?? ""}`.trim(),
        clientId: client.id,
        metadata: { clientCode: client.clientCode },
      },
      tx,
    );

    return client;
  });
}

export async function updateClient(
  ctx: OrganizationContext,
  clientId: string,
  data: Partial<ClientCreateData>,
) {
  const existing = await getClientOrThrow(ctx, clientId);
  if (existing.status === "ARCHIVED") {
    throw new DomainError("No se puede editar un cliente archivado.");
  }
  const clean = emptyToNull({ ...data });
  if (clean.assignedToId) await assertMember(ctx, clean.assignedToId as string);

  const updateData: Prisma.ClientUpdateInput = {};
  if (clean.firstName !== undefined) updateData.firstName = clean.firstName as string;
  if (clean.lastName !== undefined) updateData.lastName = clean.lastName as string | null;
  if (clean.email !== undefined) updateData.email = clean.email as string | null;
  if (clean.phone !== undefined) updateData.phone = clean.phone as string | null;
  if (clean.addressLine1 !== undefined) updateData.addressLine1 = clean.addressLine1 as string | null;
  if (clean.addressLine2 !== undefined) updateData.addressLine2 = clean.addressLine2 as string | null;
  if (clean.city !== undefined) updateData.city = clean.city as string | null;
  if (clean.state !== undefined) updateData.state = clean.state as string | null;
  if (clean.postalCode !== undefined) updateData.postalCode = clean.postalCode as string | null;
  if (clean.country) updateData.country = clean.country as string;
  if (clean.source !== undefined) updateData.source = clean.source as string | null;
  if (clean.status !== undefined) updateData.status = clean.status as ClientStatus;
  if (clean.assignedToId !== undefined) {
    updateData.assignedTo = clean.assignedToId
      ? { connect: { id: clean.assignedToId as string } }
      : { disconnect: true };
  }

  const client = await prisma.client.update({
    where: { id: existing.id },
    data: updateData,
  });

  await writeActivityLog(toActivityContext(ctx), {
    type: "NOTE",
    description: "Información del cliente actualizada.",
    clientId: client.id,
  });

  return client;
}

export async function archiveClient(ctx: OrganizationContext, clientId: string) {
  const existing = await getClientOrThrow(ctx, clientId);
  if (existing.status === "ARCHIVED") {
    throw new DomainError("El cliente ya está archivado.");
  }
  const client = await prisma.client.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  await writeActivityLog(toActivityContext(ctx), {
    type: "STATUS_CHANGE",
    description: `Cliente ${client.clientCode} archivado.`,
    clientId: client.id,
  });
  return client;
}

export async function assignClient(
  ctx: OrganizationContext,
  clientId: string,
  assignedToId: string | null,
) {
  const existing = await getClientOrThrow(ctx, clientId);
  if (assignedToId) await assertMember(ctx, assignedToId);

  const client = await prisma.client.update({
    where: { id: existing.id },
    data: { assignedToId },
    include: { assignedTo: { select: { id: true, name: true } } },
  });
  await writeActivityLog(toActivityContext(ctx), {
    type: "NOTE",
    description: assignedToId
      ? `Cliente asignado a ${client.assignedTo?.name ?? "responsable"}.`
      : "Se retiró el responsable del cliente.",
    clientId: client.id,
  });
  return client;
}

export async function listClients(ctx: OrganizationContext, filters: ClientListFilters = {}) {
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Prisma.ClientWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.q
      ? {
          OR: [
            { firstName: { contains: filters.q } },
            { lastName: { contains: filters.q } },
            { email: { contains: filters.q } },
            { phone: { contains: filters.q } },
            { clientCode: { contains: filters.q } },
          ],
        }
      : {}),
  };

  const rows = await prisma.client.findMany({
    where,
    select: CLIENT_LIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  // Listados: SSN siempre enmascarado, nunca el valor completo.
  const mapped = items.map(({ sensitive, ...client }) => ({
    ...client,
    ssnMasked: sensitive?.ssnLast4 ? maskSSN(sensitive.ssnLast4) : null,
  }));
  return {
    items: mapped,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}

/**
 * Expediente por secciones: consultas pequeñas en paralelo, sin includes
 * gigantes. El perfil sensible solo expone ssnLast4 (enmascarado).
 */
export async function getClientDetail(ctx: OrganizationContext, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
    select: {
      id: true,
      clientCode: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      source: true,
      status: true,
      assignedToId: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      sensitive: { select: { ssnLast4: true, updatedAt: true } },
    },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  const [cases, openTasks, recentQuotes, recentPayments, documents, timeline] =
    await Promise.all([
      prisma.creditCase.findMany({
        where: { clientId, organizationId: ctx.organizationId },
        select: {
          id: true,
          caseCode: true,
          state: true,
          openedAt: true,
          nextReviewAt: true,
          stage: { select: { id: true, name: true, color: true } },
        },
        orderBy: { openedAt: "desc" },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          clientId,
          organizationId: ctx.organizationId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        select: {
          id: true,
          title: true,
          type: true,
          priority: true,
          dueAt: true,
          status: true,
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: [{ dueAt: "asc" }],
        take: 20,
      }),
      prisma.quote.findMany({
        where: { clientId, organizationId: ctx.organizationId },
        select: {
          id: true,
          folio: true,
          status: true,
          total: true,
          currency: true,
          issuedAt: true,
        },
        orderBy: { issuedAt: "desc" },
        take: 10,
      }),
      prisma.payment.findMany({
        where: { clientId, organizationId: ctx.organizationId },
        select: {
          id: true,
          amount: true,
          currency: true,
          method: true,
          status: true,
          dueAt: true,
          receivedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.document.findMany({
        where: { clientId, organizationId: ctx.organizationId, deletedAt: null },
        select: {
          id: true,
          category: true,
          sensitivity: true,
          originalName: true,
          displayName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.activityLog.findMany({
        where: { clientId, organizationId: ctx.organizationId },
        select: {
          id: true,
          type: true,
          description: true,
          createdAt: true,
          actor: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

  const { sensitive, ...rest } = client;
  return {
    client: {
      ...rest,
      ssnMasked: sensitive?.ssnLast4 ? maskSSN(sensitive.ssnLast4) : null,
      sensitiveProfileUpdatedAt: sensitive?.updatedAt ?? null,
    },
    cases,
    openTasks,
    recentQuotes,
    recentPayments,
    documents,
    timeline,
  };
}

// ---------------------------------------------------------------------------
// Perfil sensible (cifrado a nivel aplicación)
// ---------------------------------------------------------------------------

export interface SensitiveProfileData {
  ssn?: string | null;
  dateOfBirth?: Date | null;
  driversLicenseNumber?: string | null;
  sensitiveNotes?: string | null;
}

/** Descifra el perfil sensible. El acceso queda auditado. */
export async function getSensitiveProfile(ctx: OrganizationContext, clientId: string) {
  await getClientOrThrow(ctx, clientId);
  const profile = await prisma.clientSensitiveProfile.findUnique({
    where: { clientId },
  });

  await writeAuditLog(toAuditContext(ctx), {
    action: "SENSITIVE_PROFILE_VIEWED",
    entityType: "ClientSensitiveProfile",
    entityId: profile?.id ?? null,
    metadata: { clientId },
  });

  if (!profile) return null;
  return {
    id: profile.id,
    clientId: profile.clientId,
    ssn: profile.ssnEncrypted ? decrypt(profile.ssnEncrypted) : null,
    ssnMasked: profile.ssnLast4 ? maskSSN(profile.ssnLast4) : null,
    dateOfBirth: profile.dateOfBirthEncrypted
      ? decrypt(profile.dateOfBirthEncrypted)
      : null,
    driversLicenseNumber: profile.driversLicenseNumberEncrypted
      ? decrypt(profile.driversLicenseNumberEncrypted)
      : null,
    sensitiveNotes: profile.sensitiveNotesEncrypted
      ? decrypt(profile.sensitiveNotesEncrypted)
      : null,
    updatedAt: profile.updatedAt,
  };
}

/** Cifra y guarda el perfil sensible. ssnLast4 se deriva del SSN. */
export async function updateSensitiveProfile(
  ctx: OrganizationContext,
  clientId: string,
  data: SensitiveProfileData,
) {
  await getClientOrThrow(ctx, clientId);

  const ssn = data.ssn?.trim() ? data.ssn.trim() : null;
  const dateOfBirth = data.dateOfBirth ?? null;
  const driversLicenseNumber = data.driversLicenseNumber?.trim() || null;
  const sensitiveNotes = data.sensitiveNotes?.trim() || null;

  const encrypted = {
    ssnEncrypted: ssn ? encrypt(ssn) : null,
    ssnLast4: ssn ? ssnLast4(ssn) : null,
    dateOfBirthEncrypted: dateOfBirth ? encrypt(dateOfBirth.toISOString()) : null,
    driversLicenseNumberEncrypted: driversLicenseNumber
      ? encrypt(driversLicenseNumber)
      : null,
    sensitiveNotesEncrypted: sensitiveNotes ? encrypt(sensitiveNotes) : null,
  };

  const profile = await prisma.clientSensitiveProfile.upsert({
    where: { clientId },
    update: encrypted,
    create: {
      organizationId: ctx.organizationId,
      clientId,
      ...encrypted,
    },
  });

  await writeAuditLog(toAuditContext(ctx), {
    action: "SENSITIVE_PROFILE_UPDATED",
    entityType: "ClientSensitiveProfile",
    entityId: profile.id,
    // Metadata sin PII: solo qué campos se tocaron.
    metadata: {
      clientId,
      fields: [
        ssn ? "ssn" : null,
        dateOfBirth ? "dateOfBirth" : null,
        driversLicenseNumber ? "driversLicenseNumber" : null,
        sensitiveNotes ? "sensitiveNotes" : null,
      ].filter(Boolean),
    },
  });

  return { id: profile.id, ssnMasked: profile.ssnLast4 ? maskSSN(profile.ssnLast4) : null };
}
