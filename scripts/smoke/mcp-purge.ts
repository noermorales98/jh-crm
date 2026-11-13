/**
 * Limpieza periódica del conector MCP (cron de retención): llaves de acceso caducadas,
 * refresh ya rotados hace tiempo, códigos usados o caducados, conexiones que nunca
 * canjearon su código y clientes OAuth huérfanos. Lo vigente no se toca. AC-14.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-purge.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();
const prisma = new PrismaClient();
const MARK = `mcppurge${Date.now()}`;
const DAY = 24 * 3600 * 1000;
let failed = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}
const h = (s: string) => s.padEnd(64, "0").slice(0, 64);

async function main() {
  console.log("\n[mcp-purge] limpieza del conector\n");
  const seed = await seedMcpOrg(prisma, MARK);
  const clients: string[] = [];
  try {
    const now = new Date();
    const old = new Date(now.getTime() - 40 * DAY);
    const client = await prisma.mcpClient.create({ data: { clientName: "Claude", redirectUris: [] } });
    clients.push(client.id);
    const orphanOld = await prisma.mcpClient.create({ data: { clientName: "Huérfano", redirectUris: [], createdAt: old } });
    const orphanNew = await prisma.mcpClient.create({ data: { clientName: "Recién registrado", redirectUris: [] } });
    clients.push(orphanOld.id, orphanNew.id);
    const conn = await prisma.mcpConnection.create({
      data: { organizationId: seed.org.id, userId: seed.staff.userId, clientId: client.id, sessionVersion: 1 },
    });
    const pendingOld = await prisma.mcpConnection.create({
      data: { organizationId: seed.org.id, userId: seed.staff.userId, clientId: client.id, sessionVersion: 1, createdAt: new Date(now.getTime() - 2 * 3600 * 1000) },
    });
    const pendingNew = await prisma.mcpConnection.create({
      data: { organizationId: seed.org.id, userId: seed.staff.userId, clientId: client.id, sessionVersion: 1 },
    });
    const revokedNoTokens = await prisma.mcpConnection.create({
      data: { organizationId: seed.org.id, userId: seed.staff.userId, clientId: client.id, sessionVersion: 1, createdAt: old, revokedAt: old },
    });
    const tok = (suffix: string, data: Record<string, unknown>) =>
      prisma.mcpToken.create({ data: { tokenHash: h(`${MARK}${suffix}`), connectionId: conn.id, ...data } as never });
    const accessExpiredOld = await tok("a1", { kind: "ACCESS", expiresAt: old });
    const accessExpiredDays = await tok("a4", { kind: "ACCESS", expiresAt: new Date(now.getTime() - 29 * DAY) });
    const accessExpired31 = await tok("a5", { kind: "ACCESS", expiresAt: new Date(now.getTime() - 31 * DAY) });
    const accessValid = await tok("a2", { kind: "ACCESS", expiresAt: new Date(now.getTime() + 3600 * 1000) });
    const accessJustExpired = await tok("a3", { kind: "ACCESS", expiresAt: new Date(now.getTime() - 3600 * 1000) });
    const refreshLive = await tok("r1", { kind: "REFRESH", expiresAt: null });
    const refreshRotatedOld = await tok("r2", { kind: "REFRESH", expiresAt: null, usedAt: old });
    const refreshRotatedRecent = await tok("r3", { kind: "REFRESH", expiresAt: null, usedAt: new Date(now.getTime() - DAY) });
    const code = (suffix: string, data: Record<string, unknown>) =>
      prisma.mcpAuthCode.create({
        data: { codeHash: h(`${MARK}c${suffix}`), connectionId: conn.id, codeChallenge: "x".repeat(43), redirectUri: "https://claude.ai/cb", ...data } as never,
      });
    const codeExpiredOld = await code("1", { expiresAt: new Date(now.getTime() - 2 * DAY) });
    const codeUsedOld = await code("2", { expiresAt: new Date(now.getTime() - 2 * DAY), usedAt: new Date(now.getTime() - 2 * DAY) });
    const codeLive = await code("3", { expiresAt: new Date(now.getTime() + 600 * 1000) });

    const { purgeMcpArtifacts } = await import("../../src/server/mcp/purge");
    const result = await purgeMcpArtifacts(now);
    const exists = {
      token: async (id: string) => !!(await prisma.mcpToken.findUnique({ where: { id } })),
      code: async (id: string) => !!(await prisma.mcpAuthCode.findUnique({ where: { id } })),
      conn: async (id: string) => !!(await prisma.mcpConnection.findUnique({ where: { id } })),
      client: async (id: string) => !!(await prisma.mcpClient.findUnique({ where: { id } })),
    };
    check("borra llaves de acceso caducadas hace más de 30 días", !(await exists.token(accessExpiredOld.id)));
    check("conserva llaves caducadas hace 29 días (siguen dando 401 para renovar, no 'inventadas')",
      await exists.token(accessExpiredDays.id));
    check("borra llaves caducadas hace 31 días (el corte es a los 30)", !(await exists.token(accessExpired31.id)));
    check("conserva llaves de acceso vigentes", await exists.token(accessValid.id));
    check("conserva llaves de acceso caducadas hace poco", await exists.token(accessJustExpired.id));
    check("conserva el refresh vigente (no caduca, AC-14)", await exists.token(refreshLive.id));
    check("borra refresh rotados hace más de 30 días", !(await exists.token(refreshRotatedOld.id)));
    check("conserva refresh rotados recientes (detección de robo)", await exists.token(refreshRotatedRecent.id));
    check("borra códigos caducados", !(await exists.code(codeExpiredOld.id)));
    check("borra códigos usados", !(await exists.code(codeUsedOld.id)));
    check("conserva códigos vigentes", await exists.code(codeLive.id));
    check("borra conexiones sin llaves de más de 1 h", !(await exists.conn(pendingOld.id)));
    check("conserva conexiones sin llaves recientes (canje en curso)", await exists.conn(pendingNew.id));
    check("conserva conexiones revocadas (historial)", await exists.conn(revokedNoTokens.id));
    check("conserva conexiones con llaves", await exists.conn(conn.id));
    check("borra clientes OAuth huérfanos de más de 24 h", !(await exists.client(orphanOld.id)));
    check("conserva clientes huérfanos recientes", await exists.client(orphanNew.id));
    check("conserva clientes con conexiones", await exists.client(client.id));
    check("devuelve los recuentos", result.accessTokens >= 1 && result.refreshTokens >= 1 && result.authCodes >= 2 &&
      result.pendingConnections >= 1 && result.orphanClients >= 1, result);
    const again = await purgeMcpArtifacts(now);
    check("idempotente: la segunda pasada no borra lo de esta prueba",
      (await exists.token(accessValid.id)) && (await exists.conn(conn.id)), again);
  } finally {
    await seed.cleanup();
    for (const id of clients) await prisma.mcpClient.delete({ where: { id } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    failed += 1;
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (failed > 0) {
      console.error(`\n✗ ${failed} comprobación(es) fallaron\n`);
      process.exit(1);
    }
    console.log("\n✓ mcp-purge OK\n");
  });
