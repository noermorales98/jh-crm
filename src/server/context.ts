import type { ActivityContext } from "@/src/server/activity";
import type { AuditContext } from "@/src/server/audit";
import type { OrganizationContext } from "@/src/server/auth/guards";

/**
 * Adaptadores de contexto: los guards devuelven { userId, organizationId,
 * role } mientras que activity/audit esperan actorUserId. Centralizado aquí
 * para no repetir el mapeo en cada servicio.
 */
export function toActivityContext(ctx: OrganizationContext): ActivityContext {
  return { organizationId: ctx.organizationId, actorUserId: ctx.userId };
}

export function toAuditContext(
  ctx: OrganizationContext,
  extras?: { ipAddress?: string | null; userAgent?: string | null },
): AuditContext {
  return {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    ipAddress: extras?.ipAddress ?? null,
    userAgent: extras?.userAgent ?? null,
  };
}
