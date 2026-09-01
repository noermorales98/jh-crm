import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { safeMetadata } from "@/src/lib/security/redaction";

/**
 * AuditLog — eventos de seguridad (descargas, consulta de SSN, cambios
 * de rol, anulaciones). No mezclar con ActivityLog (negocio).
 */

export interface AuditContext {
  organizationId: string;
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  ctx: AuditContext,
  event: AuditEvent,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? prisma;
  return client.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorUserId: ctx.actorUserId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      // Nunca persistir PII en metadata.
      metadata: safeMetadata(event.metadata) as Prisma.InputJsonValue | undefined,
    },
  });
}
