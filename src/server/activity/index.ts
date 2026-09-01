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
      roundId: event.roundId ?? null,
      metadata: safeMetadata(event.metadata) as Prisma.InputJsonValue | undefined,
    },
  });
}
