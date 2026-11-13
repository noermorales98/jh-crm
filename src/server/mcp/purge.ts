import { prisma } from "@/src/lib/db";

/**
 * Limpieza periódica del conector MCP (la llama el cron de retención). Solo datos
 * técnicos del conector; nada de negocio (regla 17 no aplica). Lo vigente no se toca:
 * - llaves de acceso caducadas hace más de 30 días (antes, una llave vieja contaría como
 *   "inventada" y podría limitarse por IP en lugar de recibir el 401 que pide renovarla);
 * - refresh ya rotados hace más de 30 días (se guardan un tiempo para detectar robos);
 * - códigos usados o caducados hace más de 1 día;
 * - conexiones que nunca recibieron llaves, sin revocar, de más de 1 hora;
 * - clientes OAuth sin conexiones de más de 24 horas.
 * Las conexiones revocadas se conservan como historial.
 */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export interface McpPurgeResult {
  accessTokens: number;
  refreshTokens: number;
  authCodes: number;
  pendingConnections: number;
  orphanClients: number;
}

export async function purgeMcpArtifacts(now: Date = new Date()): Promise<McpPurgeResult> {
  const dayAgo = new Date(now.getTime() - DAY);
  const accessTokens = await prisma.mcpToken.deleteMany({
    where: { kind: "ACCESS", expiresAt: { lt: new Date(now.getTime() - 30 * DAY) } },
  });
  const refreshTokens = await prisma.mcpToken.deleteMany({
    where: { kind: "REFRESH", usedAt: { lt: new Date(now.getTime() - 30 * DAY) } },
  });
  const authCodes = await prisma.mcpAuthCode.deleteMany({
    where: { expiresAt: { lt: dayAgo } },
  });
  const pendingConnections = await prisma.mcpConnection.deleteMany({
    where: { revokedAt: null, tokens: { none: {} }, createdAt: { lt: new Date(now.getTime() - HOUR) } },
  });
  const orphanClients = await prisma.mcpClient.deleteMany({
    where: { connections: { none: {} }, createdAt: { lt: dayAgo } },
  });
  return {
    accessTokens: accessTokens.count,
    refreshTokens: refreshTokens.count,
    authCodes: authCodes.count,
    pendingConnections: pendingConnections.count,
    orphanClients: orphanClients.count,
  };
}
