import { prisma } from "@/src/lib/db";
import { ForbiddenError, type OrganizationContext } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { writeAuditLog } from "@/src/server/audit";
import { toAuditContext } from "@/src/server/context";
import { NotFoundError } from "@/src/server/errors";
import { mcpResourceUrl } from "./oauth/http";
import { isConnectionUsable, isMcpConnectorFeatureOn } from "./oauth/service";

/**
 * Conexiones con Claude desde Configuración → Claude: las propias, las de la
 * organización (admin), revocar y el interruptor de la organización.
 * Solo se listan conexiones que llegaron a recibir llaves y no están revocadas.
 */

export type ConnectionStatus = "activa" | "cortada";

export interface ConnectionRow {
  id: string;
  clientName: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  status: ConnectionStatus;
}

async function list(where: { organizationId: string; userId?: string }): Promise<ConnectionRow[]> {
  const rows = await prisma.mcpConnection.findMany({
    where: { ...where, revokedAt: null, tokens: { some: {} } },
    include: {
      client: { select: { clientName: true } },
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      clientName: row.client.clientName,
      userId: row.userId,
      userName: row.user.name,
      userEmail: row.user.email,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      // Cortada: la persona cambió de rol o correo, se desactivó, o el conector está apagado.
      status: (await isConnectionUsable(prisma, row)) ? ("activa" as const) : ("cortada" as const),
    })),
  );
}

export async function listMyConnections(ctx: OrganizationContext): Promise<ConnectionRow[]> {
  return list({ organizationId: ctx.organizationId, userId: ctx.userId });
}

export async function listOrgConnections(ctx: OrganizationContext): Promise<ConnectionRow[]> {
  if (!can(ctx.role, "settings.manage")) throw new ForbiddenError();
  return list({ organizationId: ctx.organizationId });
}

/** La propia, o cualquiera de la organización con `settings.manage`. Idempotente. */
export async function revokeConnection(ctx: OrganizationContext, connectionId: string): Promise<void> {
  const conn = await prisma.mcpConnection.findFirst({
    where: { id: connectionId, organizationId: ctx.organizationId },
    select: { id: true, userId: true, revokedAt: true },
  });
  if (!conn) throw new NotFoundError();
  if (conn.userId !== ctx.userId && !can(ctx.role, "settings.manage")) throw new ForbiddenError();
  if (conn.revokedAt) return;
  const updated = await prisma.mcpConnection.updateMany({
    where: { id: conn.id, revokedAt: null },
    data: { revokedAt: new Date(), revokedByUserId: ctx.userId },
  });
  if (updated.count === 1) {
    await writeAuditLog(toAuditContext(ctx), {
      action: "mcp.connection.revoke",
      entityType: "McpConnection",
      entityId: conn.id,
      metadata: { ownConnection: conn.userId === ctx.userId },
    });
  }
}

export async function setMcpEnabled(ctx: OrganizationContext, enabled: boolean): Promise<void> {
  if (!can(ctx.role, "settings.manage")) throw new ForbiddenError();
  await prisma.organizationSettings.upsert({
    where: { organizationId: ctx.organizationId },
    create: { organizationId: ctx.organizationId, mcpEnabled: enabled },
    update: { mcpEnabled: enabled },
  });
  await writeAuditLog(toAuditContext(ctx), {
    action: "mcp.settings.toggle",
    entityType: "OrganizationSettings",
    entityId: ctx.organizationId,
    metadata: { enabled },
  });
}

export async function getMcpSettings(ctx: OrganizationContext) {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
    select: { mcpEnabled: true },
  });
  const featureOn = isMcpConnectorFeatureOn();
  return {
    enabled: settings?.mcpEnabled ?? false,
    featureOn,
    connectorUrl: featureOn ? mcpResourceUrl() : null,
  };
}
