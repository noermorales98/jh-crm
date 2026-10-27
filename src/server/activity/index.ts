import type { ActivityType, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { safeMetadata } from "@/src/lib/security/redaction";

/**
 * ActivityLog — eventos de negocio (cliente creado, ronda enviada, pago
 * registrado, cambio de etapa). Visible en el expediente del cliente.
 */

export interface ActivityContext {
  organizationId: string;
  actorUserId?: string | null;
}

export interface ActivityEvent {
  type: ActivityType;
  description: string;
  clientId: string;
  caseId?: string | null;
  serviceCaseId?: string | null;
  roundId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeActivityLog(
  ctx: ActivityContext,
  event: ActivityEvent,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? prisma;
  return client.activityLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorUserId: ctx.actorUserId ?? null,
      type: event.type,
      description: event.description,
      clientId: event.clientId,
      caseId: event.caseId ?? null,
      serviceCaseId: event.serviceCaseId ?? null,
      roundId: event.roundId ?? null,
      metadata: safeMetadata(event.metadata) as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Historial completo de actividad del cliente (timeline). */
export function listClientActivityEvents(organizationId: string, clientId: string) {
  return prisma.activityLog.findMany({
    where: { clientId, organizationId },
    select: {
      id: true,
      type: true,
      description: true,
      createdAt: true,
      caseId: true,
      roundId: true,
      serviceCaseId: true,
      metadata: true,
      actor: { select: { name: true, email: true } },
      case: { select: { caseCode: true, summary: true } },
      serviceCase: {
        select: {
          caseNumber: true,
          notes: true,
          service: { select: { name: true } },
        },
      },
      round: { select: { roundNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
}
