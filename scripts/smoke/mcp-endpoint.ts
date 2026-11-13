/**
 * Autenticación del endpoint MCP y despachador de herramientas, contra una base real y
 * desechable: llaves, cortes, permiso, validación, origen Claude, auditoría, refresco,
 * limpieza de datos sensibles y límite de peticiones. AC-1, AC-6, AC-8, AC-9, AC-10, AC-12.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-endpoint.ts
 */
import crypto from "node:crypto";
import { PrismaClient, type Role } from "@prisma/client";
import { z } from "zod";
import type { OrganizationContext } from "../../src/server/auth/guards";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/jh_gates(\?|$)/.test(databaseUrl)) {
  throw new Error("mcp-endpoint solo corre contra la base local desechable jh_gates.");
}
process.env.FEATURE_MCP_CONNECTOR = "true";

const prisma = new PrismaClient();
const MARK = `mcpep${Date.now()}`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const HOUR = 3600 * 1000;
const createdOrgs: string[] = [];
const createdUsers: string[] = [];
const createdClients: string[] = [];
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function errorName(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return (error as Error).name ?? "Error";
  }
}

function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function makeOrg(suffix: string) {
  const org = await prisma.organization.create({ data: { name: `TEST JH-CRM ${MARK} ${suffix}` } });
  createdOrgs.push(org.id);
  await prisma.organizationSettings.create({ data: { organizationId: org.id, mcpEnabled: true } });
  return org;
}

async function member(orgId: string, role: Role, suffix: string): Promise<OrganizationContext> {
  const user = await prisma.user.create({
    data: { email: `${MARK}-${suffix}@example.test`, passwordHash: "x", name: suffix },
  });
  createdUsers.push(user.id);
  await prisma.organizationMember.create({ data: { userId: user.id, organizationId: orgId, role } });
  return { userId: user.id, organizationId: orgId, role };
}

async function run() {
  const svc = await import("../../src/server/mcp/oauth/service");
  const { authenticate, callTool, TOOL_CALLS_PER_MINUTE } = await import("../../src/server/mcp/dispatch");
  const { defineTool } = await import("../../src/server/mcp/tools/types");
  const { writeActivityLog } = await import("../../src/server/activity");

  const reg = await svc.registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
  createdClients.push(reg.client_id);
  async function connect(ctx: OrganizationContext, now = new Date()) {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const { code, connectionId } = await svc.approve(
      ctx,
      { client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256" },
      now,
    );
    const tokens = await svc.exchangeCode(
      { code, code_verifier: verifier, client_id: reg.client_id, redirect_uri: REDIRECT },
      now,
    );
    return { ...tokens, connectionId };
  }

  const org = await makeOrg("main");
  const staff = await member(org.id, "STAFF", "staff");
  const viewer = await member(org.id, "VIEWER", "viewer");
  const client = await prisma.client.create({
    data: { organizationId: org.id, clientCode: `E-${MARK}`.slice(0, 20), firstName: "Ana", lastName: "Prueba", status: "ACTIVE" },
  });

  console.log("\n[mcp-endpoint] autenticación\n");
  const t0 = new Date();
  const k = await connect(staff, t0);
  check("sin llave → UnauthorizedError", (await errorName(() => authenticate(null, t0))) === "UnauthorizedError");
  check("llave inventada → UnauthorizedError", (await errorName(() => authenticate("basura", t0))) === "UnauthorizedError");
  check("refresh usado como llave de acceso → UnauthorizedError",
    (await errorName(() => authenticate(k.refresh_token, t0))) === "UnauthorizedError");
  const ctx = await authenticate(k.access_token, t0);
  check("llave válida → contexto de la persona",
    ctx.userId === staff.userId && ctx.organizationId === org.id && ctx.role === "STAFF" &&
      ctx.connectionId === k.connectionId, ctx);
  check("llave caducada (1 h + 1 s) → UnauthorizedError",
    (await errorName(() => authenticate(k.access_token, new Date(t0.getTime() + HOUR + 1000)))) === "UnauthorizedError");
  check("llave a los 59 min → válida",
    (await errorName(() => authenticate(k.access_token, new Date(t0.getTime() + 59 * 60 * 1000)))) === "ok");

  await prisma.organizationMember.updateMany({ where: { userId: staff.userId, organizationId: org.id }, data: { role: "SPECIALIST" } });
  check("el rol se lee en cada petición", (await authenticate(k.access_token, t0)).role === "SPECIALIST");
  await prisma.organizationMember.updateMany({ where: { userId: staff.userId, organizationId: org.id }, data: { role: "STAFF" } });

  await prisma.organizationSettings.update({ where: { organizationId: org.id }, data: { mcpEnabled: false } });
  check("org con el conector apagado → UnauthorizedError (AC-10)",
    (await errorName(() => authenticate(k.access_token, t0))) === "UnauthorizedError");
  await prisma.organizationSettings.update({ where: { organizationId: org.id }, data: { mcpEnabled: true } });

  process.env.FEATURE_MCP_CONNECTOR = "false";
  check("flag apagado → UnauthorizedError", (await errorName(() => authenticate(k.access_token, t0))) === "UnauthorizedError");
  process.env.FEATURE_MCP_CONNECTOR = "true";

  const inactive = await member(org.id, "STAFF", "inactive");
  const ki = await connect(inactive, t0);
  await prisma.user.update({ where: { id: inactive.userId }, data: { isActive: false } });
  check("usuario desactivado → UnauthorizedError", (await errorName(() => authenticate(ki.access_token, t0))) === "UnauthorizedError");

  const sv = await member(org.id, "STAFF", "sv");
  const ks = await connect(sv, t0);
  await prisma.user.update({ where: { id: sv.userId }, data: { sessionVersion: { increment: 1 } } });
  check("cambio de rol/correo (sessionVersion) → UnauthorizedError",
    (await errorName(() => authenticate(ks.access_token, t0))) === "UnauthorizedError");

  const kr = await connect(staff, t0);
  await svc.revokeToken(kr.refresh_token, t0);
  check("conexión revocada → UnauthorizedError (AC-9)",
    (await errorName(() => authenticate(kr.access_token, t0))) === "UnauthorizedError");

  console.log("\n[mcp-endpoint] despachador\n");
  const revalidated: string[] = [];
  const readTool = defineTool({
    name: "leer_prueba",
    title: "Leer (prueba)",
    description: "Herramienta de prueba de lectura.",
    inputSchema: z.object({ id: z.string() }),
    permission: "clients.view",
    kind: "read",
    run: async (_c, input) => ({ id: input.id, ssn: "123-45-6789", accountNumber: "000123456789", nombre: "Ana" }),
  });
  const writeTool = defineTool({
    name: "escribir_prueba",
    title: "Escribir (prueba)",
    description: "Herramienta de prueba de escritura.",
    inputSchema: z.object({ clientId: z.string(), texto: z.string().min(1) }),
    permission: "clients.edit",
    kind: "write",
    run: async (c, input) => {
      await writeActivityLog(
        { organizationId: c.organizationId, actorUserId: c.userId },
        { type: "NOTE", description: input.texto, clientId: input.clientId },
      );
      return { id: input.clientId };
    },
    audit: (input) => ({ entityType: "Client", entityId: input.clientId }),
    revalidate: (_r, input) => [`/crm/clientes/${input.clientId}`],
  });
  const tools = [readTool, writeTool] as never[];
  const opts = { tools, now: t0, revalidate: (p: string) => revalidated.push(p) };

  const read = (await callTool(ctx, "leer_prueba", { id: "x" }, opts)) as Record<string, unknown>;
  check("lectura → resultado", read?.nombre === "Ana", read);
  check("lectura → SSN limpiado (AC-6)", !JSON.stringify(read).includes("123-45-6789"), read);
  check("lectura → número de cuenta limpiado (AC-6)", !JSON.stringify(read).includes("000123456789"), read);
  check("lectura → sin entrada de auditoría",
    (await prisma.auditLog.count({ where: { organizationId: org.id, action: "mcp.tool.leer_prueba" } })) === 0);

  check("herramienta desconocida → NotFoundError",
    (await errorName(() => callTool(ctx, "no_existe", {}, opts))) === "NotFoundError");

  const vctx = await authenticate((await connect(viewer, t0)).access_token, t0);
  check("VIEWER lee (AC-4)", (await errorName(() => callTool(vctx, "leer_prueba", { id: "x" }, opts))) === "ok");
  const before = await prisma.activityLog.count({ where: { clientId: client.id } });
  check("VIEWER escribe → ForbiddenError (AC-4)",
    (await errorName(() => callTool(vctx, "escribir_prueba", { clientId: client.id, texto: "no" }, opts))) === "ForbiddenError");
  check("…y no escribe nada", (await prisma.activityLog.count({ where: { clientId: client.id } })) === before);
  check("argumentos inválidos → ZodError",
    (await errorName(() => callTool(ctx, "escribir_prueba", { clientId: client.id, texto: "" }, opts))) === "ZodError");
  check("…y no escribe nada", (await prisma.activityLog.count({ where: { clientId: client.id } })) === before);

  const logs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;
  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  console.error = console.log;
  console.warn = console.log;
  let written: unknown;
  try {
    written = await callTool(ctx, "escribir_prueba", { clientId: client.id, texto: "SECRETO-NO-LOG" }, opts);
  } finally {
    console.log = origLog;
    console.error = origErr;
    console.warn = origWarn;
  }
  check("escritura → resultado", (written as { id?: string })?.id === client.id, written);
  check("no se registran argumentos en logs (regla 16)", !logs.some((l) => l.includes("SECRETO-NO-LOG")), logs);
  const act = await prisma.activityLog.findFirst({ where: { clientId: client.id, description: "SECRETO-NO-LOG" } });
  check("actividad con origen Claude (AC-8)",
    meta(act?.metadata).via === "claude" && meta(act?.metadata).connectionId === ctx.connectionId, act?.metadata);
  const aud = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "mcp.tool.escribir_prueba" } });
  check("auditoría mcp.tool.<nombre> (AC-8)",
    !!aud && aud.entityType === "Client" && aud.entityId === client.id && aud.actorUserId === staff.userId, aud);
  check("auditoría con origen Claude y conexión",
    meta(aud?.metadata).via === "claude" && meta(aud?.metadata).connectionId === ctx.connectionId, aud?.metadata);
  check("auditoría sin argumentos", !JSON.stringify(aud?.metadata ?? {}).includes("SECRETO-NO-LOG"));
  check("refresca la ficha del cliente", revalidated.includes(`/crm/clientes/${client.id}`), revalidated);
  const conn = await prisma.mcpConnection.findUnique({ where: { id: ctx.connectionId } });
  check("la conexión anota su último uso", conn?.lastUsedAt instanceof Date);

  console.log("\n[mcp-endpoint] límite de peticiones (AC-12)\n");
  const lctx = await authenticate((await connect(staff, t0)).access_token, t0);
  let early = false;
  for (let i = 0; i < TOOL_CALLS_PER_MINUTE; i += 1) {
    if ((await errorName(() => callTool(lctx, "leer_prueba", { id: "x" }, opts))) !== "ok") early = true;
  }
  check(`las primeras ${TOOL_CALLS_PER_MINUTE} llamadas pasan`, !early);
  const beforeLimit = await prisma.activityLog.count({ where: { clientId: client.id } });
  check("la siguiente → RateLimitError",
    (await errorName(() => callTool(lctx, "escribir_prueba", { clientId: client.id, texto: "tope" }, opts))) === "RateLimitError");
  check("…sin escribir nada", (await prisma.activityLog.count({ where: { clientId: client.id } })) === beforeLimit);
  check("otra conexión no comparte el límite",
    (await errorName(() => callTool(ctx, "leer_prueba", { id: "x" }, opts))) === "ok");
}

async function main() {
  console.log("\n[mcp-endpoint] endpoint MCP\n");
  try {
    await run();
  } finally {
    for (const id of createdOrgs) await prisma.organization.delete({ where: { id } }).catch(() => undefined);
    for (const id of createdClients) await prisma.mcpClient.delete({ where: { id } }).catch(() => undefined);
    for (const id of createdUsers) await prisma.user.delete({ where: { id } }).catch(() => undefined);
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
    console.log("\n✓ mcp-endpoint OK\n");
  });
