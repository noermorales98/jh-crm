/**
 * Conexiones con Claude desde Configuración: listar las propias y las de la organización,
 * revocar y encender/apagar el conector. AC-9, AC-10, AC-11.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-connections.ts
 */
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, seedMcpOrg, type McpTestCtx } from "./_lib/mcp-seed";

assertDisposableDb();
process.env.FEATURE_MCP_CONNECTOR = "true";
process.env.NEXT_PUBLIC_APP_URL = "https://crm.example.test";
const prisma = new PrismaClient();
const MARK = `mcpconn${Date.now()}`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
let failed = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function run(seed: Awaited<ReturnType<typeof seedMcpOrg>>, other: Awaited<ReturnType<typeof seedMcpOrg>>, clients: string[]) {
  const svc = await import("../../src/server/mcp/oauth/service");
  const conns = await import("../../src/server/mcp/connections");
  const reg = await svc.registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
  clients.push(reg.client_id);

  async function connect(ctx: McpTestCtx, exchange = true) {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const { code, connectionId } = await svc.approve(ctx, {
      client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256",
    });
    if (exchange) await svc.exchangeCode({ code, code_verifier: verifier, client_id: reg.client_id, redirect_uri: REDIRECT });
    return connectionId;
  }

  const staffConn = await connect(seed.staff);
  const pending = await connect(seed.staff, false);
  const ownerConn = await connect(seed.owner);
  const otherConn = await connect(other.owner);

  console.log("\n[mcp-connections] listar\n");
  const mine = await conns.listMyConnections(seed.staff);
  check("propias: incluye la conexión con llaves", mine.some((c) => c.id === staffConn), mine);
  check("propias: no incluye las de otra persona", !mine.some((c) => c.id === ownerConn));
  check("propias: no incluye una conexión que nunca canjeó su código", !mine.some((c) => c.id === pending));
  check("propias: estado activa y nombre del cliente", mine.find((c) => c.id === staffConn)?.status === "activa" &&
    mine.find((c) => c.id === staffConn)?.clientName === "Claude");
  check("organización: STAFF → ForbiddenError",
    (await errorName(() => conns.listOrgConnections(seed.staff))) === "ForbiddenError");
  const org = await conns.listOrgConnections(seed.owner);
  check("organización: el admin ve las de todos", org.some((c) => c.id === staffConn) && org.some((c) => c.id === ownerConn), org);
  check("organización: nunca las de otra organización", !org.some((c) => c.id === otherConn));
  check("organización: nombre y correo de la persona", !!org.find((c) => c.id === staffConn)?.userEmail);

  console.log("\n[mcp-connections] estado cortada\n");
  const svUser = await seed.member("STAFF");
  const svConn = await connect(svUser);
  await prisma.user.update({ where: { id: svUser.userId }, data: { sessionVersion: { increment: 1 } } });
  const svList = await conns.listMyConnections(svUser);
  check("cambio de rol/correo → la conexión aparece como cortada", svList.find((c) => c.id === svConn)?.status === "cortada", svList);

  console.log("\n[mcp-connections] revocar (AC-9)\n");
  check("STAFF no puede revocar la de otra persona",
    (await errorName(() => conns.revokeConnection(seed.staff, ownerConn))) === "ForbiddenError");
  check("una conexión de otra organización → NotFoundError",
    (await errorName(() => conns.revokeConnection(seed.owner, otherConn))) === "NotFoundError");
  check("revocar la propia → ok", (await errorName(() => conns.revokeConnection(seed.staff, staffConn))) === "ok");
  const revoked = await prisma.mcpConnection.findUnique({ where: { id: staffConn } });
  check("queda revocada con quién la revocó", revoked?.revokedAt instanceof Date && revoked.revokedByUserId === seed.staff.userId);
  check("ya no aparece en la lista", !(await conns.listMyConnections(seed.staff)).some((c) => c.id === staffConn));
  check("revocar otra vez → ok sin cambiar la hora",
    (await errorName(() => conns.revokeConnection(seed.staff, staffConn))) === "ok" &&
      (await prisma.mcpConnection.findUnique({ where: { id: staffConn } }))?.revokedAt?.getTime() === revoked?.revokedAt?.getTime());
  const another = await connect(seed.staff);
  check("el admin revoca la de otra persona", (await errorName(() => conns.revokeConnection(seed.owner, another))) === "ok");
  const audit = await prisma.auditLog.count({ where: { organizationId: seed.org.id, action: "mcp.connection.revoke" } });
  check("cada revocación queda en auditoría", audit >= 2, audit);

  console.log("\n[mcp-connections] interruptor de la organización (AC-10)\n");
  check("STAFF no puede apagar el conector", (await errorName(() => conns.setMcpEnabled(seed.staff, false))) === "ForbiddenError");
  await conns.setMcpEnabled(seed.owner, false);
  check("el admin lo apaga", (await conns.getMcpSettings(seed.owner)).enabled === false);
  check("apagar queda en auditoría",
    (await prisma.auditLog.count({ where: { organizationId: seed.org.id, action: "mcp.settings.toggle" } })) === 1);
  await conns.setMcpEnabled(seed.owner, true);
  const settings = await conns.getMcpSettings(seed.staff);
  check("ajustes: encendido, flag y dirección del conector",
    settings.enabled && settings.featureOn && settings.connectorUrl === "https://crm.example.test/api/mcp", settings);
  process.env.FEATURE_MCP_CONNECTOR = "false";
  check("con el flag apagado, sin dirección", (await conns.getMcpSettings(seed.staff)).connectorUrl === null);
  process.env.FEATURE_MCP_CONNECTOR = "true";
}

async function main() {
  console.log("\n[mcp-connections] conexiones con Claude\n");
  const seed = await seedMcpOrg(prisma, MARK);
  const other = await seedMcpOrg(prisma, `${MARK}o`);
  const clients: string[] = [];
  try {
    await run(seed, other, clients);
  } finally {
    await seed.cleanup();
    await other.cleanup();
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
    console.log("\n✓ mcp-connections OK\n");
  });
