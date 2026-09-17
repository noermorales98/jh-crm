import {
  Prisma,
  type ConsultationStatus,
} from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import { createNotification } from "@/src/server/notifications";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import { getConsultationPaymentGateway } from "@/src/lib/payments/consultation-gateway";

const dec = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const money = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface RequestConsultationData {
  clientId: string;
  amount?: Prisma.Decimal | number | string | null;
  notes?: string | null;
}

export interface ConsultationListFilters {
  status?: ConsultationStatus;
  clientId?: string;
  cursor?: string;
  limit?: number;
}

/**
 * Cobro de consulta: Stripe org configurado y FEATURE_CONSULTATION_PAYMENTS
 * no está en "false".
 */
export async function isConsultationPaymentConfigured(
  organizationId: string,
): Promise<boolean> {
  return getConsultationPaymentGateway().isConfigured(organizationId);
}

async function notifyConsultationRequested(
  organizationId: string,
  consultation: { id: string; amount: Prisma.Decimal },
  client: { id: string; firstName: string; lastName: string | null },
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
  const body = `Consulta de ${fullName} · ${consultation.amount.toString()} USD (solicitud recibida; sin cobro automático).`;

  let sendWhatsapp = true;
  for (const member of members) {
    await createNotification({
      organizationId,
      userId: member.userId,
      type: "CONSULTATION_REQUESTED",
      title: "Consulta solicitada",
      body,
      link: `/crm/consultas`,
      dedupeKey: `consultation:${consultation.id}:requested:${member.userId}`,
      skipWhatsapp: !sendWhatsapp,
    });
    sendWhatsapp = false;
  }
}

/**
 * Crea una Consultation en REQUESTED.
 * Acepta OrganizationContext o solo organizationId (flujo público).
 */
export async function requestConsultation(
  ctxOrOrg:
    | OrganizationContext
    | { organizationId: string; userId?: string | null },
  data: RequestConsultationData,
) {
  const organizationId = ctxOrOrg.organizationId;
  const actorUserId =
    "userId" in ctxOrOrg ? (ctxOrOrg.userId ?? null) : null;

  const amount = money(dec(data.amount ?? 1));
  if (amount.lte(0)) {
    throw new DomainError("El monto de la consulta debe ser mayor a 0.");
  }

  const client = await prisma.client.findFirst({
    where: { id: data.clientId, organizationId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  // Nunca auto-PAID: sin pasarela real permanece REQUESTED.
  const status: ConsultationStatus = "REQUESTED";

  const consultation = await prisma.$transaction(async (tx) => {
    const created = await tx.consultation.create({
      data: {
        organizationId,
        clientId: client.id,
        amount,
        status,
        notes: data.notes?.trim() || null,
      },
    });

    await writeActivityLog(
      { organizationId, actorUserId },
      {
        type: "CONSULTATION_REQUESTED",
        description: `Consulta solicitada (${amount.toString()} USD). Solicitud recibida.`,
        clientId: client.id,
        metadata: {
          consultationId: created.id,
          amount: amount.toString(),
          status,
        },
      },
      tx,
    );

    return created;
  });

  try {
    await notifyConsultationRequested(organizationId, consultation, client);
  } catch (error) {
    console.error(
      "[consultations] no se pudo notificar:",
      error instanceof Error ? error.message : "error",
    );
  }

  return consultation;
}

export async function listConsultations(
  ctx: OrganizationContext,
  filters: ConsultationListFilters = {},
) {
  const limit = Math.min(filters.limit ?? 30, 100);
  const where: Prisma.ConsultationWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
  };

  const rows = await prisma.consultation.findMany({
    where,
    include: {
      client: {
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
      payment: { select: { id: true, status: true } },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

const ALLOWED_TRANSITIONS: Record<
  ConsultationStatus,
  ConsultationStatus[]
> = {
  REQUESTED: ["PAYMENT_PENDING", "SCHEDULED", "COMPLETED", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "SCHEDULED", "CANCELLED"],
  PAID: ["SCHEDULED", "COMPLETED", "CANCELLED"],
  SCHEDULED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function updateConsultationStatus(
  ctx: OrganizationContext,
  consultationId: string,
  status: ConsultationStatus,
  opts?: { scheduledAt?: Date | null; notes?: string | null },
) {
  const consultation = await prisma.consultation.findFirst({
    where: { id: consultationId, organizationId: ctx.organizationId },
  });
  if (!consultation) throw new DomainError("Consulta no encontrada.");

  const allowed = ALLOWED_TRANSITIONS[consultation.status] ?? [];
  if (!allowed.includes(status)) {
    throw new DomainError(
      `No se puede pasar de ${consultation.status} a ${status}.`,
    );
  }

  if (status === "PAYMENT_PENDING" && !(await isConsultationPaymentConfigured(ctx.organizationId))) {
    throw new DomainError(
      "El cobro de consultas no está configurado. No se puede marcar como pago pendiente.",
    );
  }

  if (status === "PAID" && !(await isConsultationPaymentConfigured(ctx.organizationId))) {
    throw new DomainError(
      "No se puede marcar como pagada sin una pasarela de cobro real.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.consultation.update({
      where: { id: consultation.id },
      data: {
        status,
        ...(opts?.scheduledAt !== undefined
          ? { scheduledAt: opts.scheduledAt }
          : status === "SCHEDULED" && !consultation.scheduledAt
            ? { scheduledAt: new Date() }
            : {}),
        ...(opts?.notes !== undefined
          ? { notes: opts.notes?.trim() || null }
          : {}),
        ...(status === "COMPLETED"
          ? { completedAt: consultation.completedAt ?? new Date() }
          : {}),
      },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STATUS_CHANGE",
        description: `Consulta: ${consultation.status} → ${status}.`,
        clientId: consultation.clientId,
        metadata: {
          consultationId: consultation.id,
          from: consultation.status,
          to: status,
        },
      },
      tx,
    );

    return updated;
  });
}
