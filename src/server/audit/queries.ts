import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import type { OrganizationContext } from "@/src/server/auth/guards";

/**
 * Consulta de auditoría de seguridad. Solo OWNER/ADMIN (validado en la
 * capa superior con requireRole / requirePermission).
 */

export interface AuditListFilters {
  action?: string;
  entityType?: string;
  actorUserId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export async function listAuditLogs(ctx: OrganizationContext, filters: AuditListFilters = {}) {
  const limit = Math.min(filters.limit ?? 30, 100);
  const where: Prisma.AuditLogWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.auditLog.findMany({
    where,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      ipAddress: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

/** Acciones conocidas, para poblar filtros en la UI de auditoría. */
export const KNOWN_AUDIT_ACTIONS = [
  "SENSITIVE_PROFILE_VIEWED",
  "SENSITIVE_PROFILE_UPDATED",
  "DOCUMENT_DOWNLOADED",
  "DOCUMENT_DELETED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CANCELLED",
  "PAYMENT_REFUNDED",
  "RECEIPT_VOIDED",
  "MEMBER_INVITED",
  "MEMBER_ROLE_CHANGED",
  "MEMBER_DEACTIVATED",
  "MEMBER_EMAIL_CHANGED",
  "INTAKE_SUBMITTED",
] as const;
