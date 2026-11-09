/**
 * Servicio OAuth del conector MCP contra una base real y desechable:
 * registro, consentimiento, código por llaves, rotación y revocación.
 * AC-9, AC-10, AC-13, AC-14.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-oauth-db.ts
 */
import crypto from "node:crypto";
import { PrismaClient, type Role } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/jh_gates(\?|$)/.test(databaseUrl)) {
  throw new Error("mcp-oauth-db solo corre contra la base local desechable jh_gates.");
}
process.env.FEATURE_MCP_CONNECTOR = "true";

const prisma = new PrismaClient();
const MARK = `oauth${Date.now()}`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const HOUR = 3600 * 1000;
let failed = 0;
const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdClients: string[] = [];

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

/** Devuelve el código OAuth del error, o "ok" si no lanzó. */
async function outcome(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : `throw:${(error as Error).message}`;
  }
}

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function makeUser(suffix: string) {
  const user = await prisma.user.create({
    data: { email: `${MARK}-${suffix}@example.test`, passwordHash: "x", name: suffix },
  });
  createdUsers.push(user.id);
  return user;
}

async function makeOrg(suffix: string, mcpEnabled: boolean) {
  const org = await prisma.organization.create({ data: { name: `TEST JH-CRM ${MARK} ${suffix}` } });
  createdOrgs.push(org.id);
  await prisma.organizationSettings.create({ data: { organizationId: org.id, mcpEnabled } });
  return org;
}

async function member(orgId: string, role: Role, suffix: string): Promise<OrganizationContext> {
  const user = await makeUser(suffix);
  await prisma.organizationMember.create({
    data: { userId: user.id, organizationId: orgId, role },
  });
  return { userId: user.id, organizationId: orgId, role };
}

async function run() {
  const svc = await import("../../src/server/mcp/oauth/service");
  const { hashToken } = await import("../../src/server/mcp/oauth/core");

  console.log("\n[mcp-oauth-db] registro de clientes\n");
  const reg = await svc.registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] }).catch((e) => e);
  const clientId = (reg as { client_id?: string }).client_id ?? "";
  if (clientId) createdClients.push(clientId);
  check("registro con callback de Claude → client_id", clientId.length > 0, reg);
  check(
    "registro con redirect ajeno → invalid_redirect_uri",
    (await outcome(() =>
      svc.registerClient({ client_name: "x", redirect_uris: ["https://evil.com/cb"] }),
    )) === "invalid_redirect_uri",
  );
  check(
    "registro sin redirect_uris → invalid_redirect_uri",
    (await outcome(() => svc.registerClient({ client_name: "x", redirect_uris: [] }))) ===
      "invalid_redirect_uri",
  );
  check(
    "registro con más de 5 redirect_uris → invalid_redirect_uri",
    (await outcome(() =>
      svc.registerClient({ client_name: "x", redirect_uris: Array(6).fill(REDIRECT) }),
    )) === "invalid_redirect_uri",
  );
  check(
    "registro con nombre de 201 caracteres → invalid_client_metadata",
    (await outcome(() =>
      svc.registerClient({ client_name: "a".repeat(201), redirect_uris: [REDIRECT] }),
    )) === "invalid_client_metadata",
  );

  console.log("\n[mcp-oauth-db] consentimiento (approve)\n");
  const org = await makeOrg("on", true);
  const roles: Role[] = ["OWNER", "ADMIN", "SPECIALIST", "STAFF", "VIEWER"];
  const req = (challenge: string, extra: Partial<Record<string, string>> = {}) => ({
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...extra,
  });

  for (const role of roles) {
    const ctx = await member(org.id, role, role.toLowerCase());
    const { verifier, challenge } = pkcePair();
    const result = await outcome(async () => {
      const { code } = await svc.approve(ctx, req(challenge));
      const tokens = await svc.exchangeCode({
        code,
        code_verifier: verifier,
        client_id: clientId,
        redirect_uri: REDIRECT,
      });
      if (!tokens.access_token || !tokens.refresh_token) throw new Error("sin tokens");
    });
    check(`${role} conecta y obtiene llaves (AC-13)`, result === "ok", result);
  }

  const staff = await member(org.id, "STAFF", "main");
  const pk = pkcePair();
  check(
    "cliente desconocido → unauthorized_client",
    (await outcome(() => svc.approve(staff, { ...req(pk.challenge), client_id: "nope" }))) ===
      "unauthorized_client",
  );
  check(
    "redirect_uri no registrada → invalid_request",
    (await outcome(() =>
      svc.approve(staff, req(pk.challenge, { redirect_uri: "https://claude.com/api/mcp/auth_callback" })),
    )) === "invalid_request",
  );
  check(
    "método plain → invalid_request",
    (await outcome(() => svc.approve(staff, req(pk.challenge, { code_challenge_method: "plain" })))) ===
      "invalid_request",
  );
  check(
    "challenge mal formado → invalid_request",
    (await outcome(() => svc.approve(staff, req("corto")))) === "invalid_request",
  );

  const offOrg = await makeOrg("off", false);
  const offCtx = await member(offOrg.id, "OWNER", "offowner");
  check(
    "organización con el conector apagado → access_denied (AC-10)",
    (await outcome(() => svc.approve(offCtx, req(pk.challenge)))) === "access_denied",
  );

  process.env.FEATURE_MCP_CONNECTOR = "false";
  check(
    "flag FEATURE_MCP_CONNECTOR apagado → access_denied",
    (await outcome(() => svc.approve(staff, req(pk.challenge)))) === "access_denied",
  );
  process.env.FEATURE_MCP_CONNECTOR = "true";

  check(
    "sesión del portal (id que no es usuario del equipo) → access_denied",
    (await outcome(() =>
      svc.approve({ userId: `portal-${MARK}`, organizationId: org.id, role: "STAFF" }, req(pk.challenge)),
    )) === "access_denied",
  );
  const outsider = await member(offOrg.id, "OWNER", "outsider");
  check(
    "usuario de otra organización → access_denied",
    (await outcome(() =>
      svc.approve({ ...outsider, organizationId: org.id }, req(pk.challenge)),
    )) === "access_denied",
  );
  const inactive = await member(org.id, "STAFF", "inactive");
  await prisma.user.update({ where: { id: inactive.userId }, data: { isActive: false } });
  check(
    "usuario desactivado → access_denied",
    (await outcome(() => svc.approve(inactive, req(pk.challenge)))) === "access_denied",
  );

  console.log("\n[mcp-oauth-db] código por llaves\n");
  const t0 = new Date();
  const a1 = pkcePair();
  const { code, connectionId } = await svc.approve(staff, req(a1.challenge), t0);
  const connRow = await prisma.mcpConnection.findUnique({ where: { id: connectionId } });
  const staffUser = await prisma.user.findUnique({ where: { id: staff.userId } });
  check("la conexión guarda la sessionVersion del usuario", connRow?.sessionVersion === staffUser?.sessionVersion);
  check("la conexión es de la persona y su organización",
    connRow?.userId === staff.userId && connRow?.organizationId === org.id);
  check(
    "código no se guarda en claro",
    (await prisma.mcpAuthCode.count({ where: { codeHash: code } })) === 0 &&
      (await prisma.mcpAuthCode.count({ where: { codeHash: hashToken(code) } })) === 1,
  );
  check(
    "verifier equivocado → invalid_grant",
    (await outcome(() =>
      svc.exchangeCode(
        { code, code_verifier: pkcePair().verifier, client_id: clientId, redirect_uri: REDIRECT },
        t0,
      ),
    )) === "invalid_grant",
  );
  check(
    "client_id distinto → invalid_grant",
    (await outcome(() =>
      svc.exchangeCode({ code, code_verifier: a1.verifier, client_id: "otro", redirect_uri: REDIRECT }, t0),
    )) === "invalid_grant",
  );
  check(
    "redirect_uri distinta → invalid_grant",
    (await outcome(() =>
      svc.exchangeCode(
        { code, code_verifier: a1.verifier, client_id: clientId, redirect_uri: `${REDIRECT}x` },
        t0,
      ),
    )) === "invalid_grant",
  );
  const tokens = await svc.exchangeCode(
    { code, code_verifier: a1.verifier, client_id: clientId, redirect_uri: REDIRECT },
    t0,
  );
  check("token_type Bearer y expires_in 3600", tokens.token_type === "Bearer" && tokens.expires_in === 3600);
  check("access y refresh distintos", tokens.access_token !== tokens.refresh_token);
  const accessRow = await prisma.mcpToken.findUnique({ where: { tokenHash: hashToken(tokens.access_token) } });
  const refreshRow = await prisma.mcpToken.findUnique({ where: { tokenHash: hashToken(tokens.refresh_token) } });
  check("tokens no se guardan en claro",
    (await prisma.mcpToken.count({ where: { tokenHash: { in: [tokens.access_token, tokens.refresh_token] } } })) === 0);
  check("access caduca a 1 h (AC-14)",
    accessRow?.kind === "ACCESS" && accessRow.expiresAt?.getTime() === t0.getTime() + HOUR, accessRow);
  check("refresh no caduca (AC-14)", refreshRow?.kind === "REFRESH" && refreshRow.expiresAt === null, refreshRow);

  check(
    "código reutilizado → invalid_grant",
    (await outcome(() =>
      svc.exchangeCode({ code, code_verifier: a1.verifier, client_id: clientId, redirect_uri: REDIRECT }, t0),
    )) === "invalid_grant",
  );
  const afterReuse = await prisma.mcpConnection.findUnique({ where: { id: connectionId } });
  check("código reutilizado → la conexión queda revocada", afterReuse?.revokedAt instanceof Date);

  const a2 = pkcePair();
  const late = await svc.approve(staff, req(a2.challenge), t0);
  check(
    "código caducado (11 min) → invalid_grant",
    (await outcome(() =>
      svc.exchangeCode(
        { code: late.code, code_verifier: a2.verifier, client_id: clientId, redirect_uri: REDIRECT },
        new Date(t0.getTime() + 11 * 60 * 1000),
      ),
    )) === "invalid_grant",
  );

  console.log("\n[mcp-oauth-db] rotación del refresh\n");
  const a3 = pkcePair();
  const c3 = await svc.approve(staff, req(a3.challenge), t0);
  const first = await svc.exchangeCode(
    { code: c3.code, code_verifier: a3.verifier, client_id: clientId, redirect_uri: REDIRECT },
    t0,
  );
  const farFuture = new Date(t0.getTime() + 400 * 24 * HOUR);
  const second = await svc.refresh({ refresh_token: first.refresh_token, client_id: clientId }, farFuture)
    .catch((e) => e);
  check("refresh funciona 400 días después (no caduca, AC-14)",
    typeof (second as { access_token?: string }).access_token === "string", second);
  const s = second as { access_token: string; refresh_token: string };
  check("rotación da llaves nuevas", s.refresh_token !== first.refresh_token && s.access_token !== first.access_token);
  const newAccess = await prisma.mcpToken.findUnique({ where: { tokenHash: hashToken(s.access_token) } });
  check("access nuevo caduca 1 h después del refresh",
    newAccess?.expiresAt?.getTime() === farFuture.getTime() + HOUR, newAccess);
  check(
    "client_id distinto en refresh → invalid_grant",
    (await outcome(() => svc.refresh({ refresh_token: s.refresh_token, client_id: "otro" }, farFuture))) ===
      "invalid_grant",
  );
  check(
    "refresh ya usado → invalid_grant",
    (await outcome(() => svc.refresh({ refresh_token: first.refresh_token, client_id: clientId }, farFuture))) ===
      "invalid_grant",
  );
  const c3conn = await prisma.mcpConnection.findUnique({ where: { id: c3.connectionId } });
  check("refresh reutilizado → la conexión entera queda revocada (AC-9)", c3conn?.revokedAt instanceof Date);
  check(
    "tras la revocación, el refresh vigente tampoco sirve",
    (await outcome(() => svc.refresh({ refresh_token: s.refresh_token, client_id: clientId }, farFuture))) ===
      "invalid_grant",
  );

  console.log("\n[mcp-oauth-db] cortes\n");
  async function connect(ctx: OrganizationContext) {
    const p = pkcePair();
    const c = await svc.approve(ctx, req(p.challenge), t0);
    const t = await svc.exchangeCode(
      { code: c.code, code_verifier: p.verifier, client_id: clientId, redirect_uri: REDIRECT },
      t0,
    );
    return { ...t, connectionId: c.connectionId };
  }
  const k1 = await connect(staff);
  await prisma.organizationSettings.update({ where: { organizationId: org.id }, data: { mcpEnabled: false } });
  check(
    "org apagada después de conectar → refresh invalid_grant (AC-10)",
    (await outcome(() => svc.refresh({ refresh_token: k1.refresh_token, client_id: clientId }, t0))) ===
      "invalid_grant",
  );
  await prisma.organizationSettings.update({ where: { organizationId: org.id }, data: { mcpEnabled: true } });

  const k2 = await connect(staff);
  await prisma.user.update({ where: { id: staff.userId }, data: { sessionVersion: { increment: 1 } } });
  check(
    "cambio de rol/correo (sessionVersion) → refresh invalid_grant",
    (await outcome(() => svc.refresh({ refresh_token: k2.refresh_token, client_id: clientId }, t0))) ===
      "invalid_grant",
  );

  const k3 = await connect(staff);
  check("revocar un refresh responde sin error", (await outcome(() => svc.revokeToken(k3.refresh_token, t0))) === "ok");
  const k3conn = await prisma.mcpConnection.findUnique({ where: { id: k3.connectionId } });
  check("revocar un refresh revoca la conexión (AC-9)", k3conn?.revokedAt instanceof Date);
  check(
    "refresh revocado → invalid_grant",
    (await outcome(() => svc.refresh({ refresh_token: k3.refresh_token, client_id: clientId }, t0))) ===
      "invalid_grant",
  );
  const k4 = await connect(staff);
  await svc.revokeToken(k4.access_token, t0);
  const k4access = await prisma.mcpToken.findUnique({ where: { tokenHash: hashToken(k4.access_token) } });
  check("revocar un access lo caduca", !!k4access?.expiresAt && k4access.expiresAt.getTime() <= t0.getTime());
  check("revocar un token desconocido responde sin error",
    (await outcome(() => svc.revokeToken("desconocido", t0))) === "ok");
}

async function main() {
  console.log("\n[mcp-oauth-db] servicio OAuth del conector\n");
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
    console.log("\n✓ mcp-oauth-db OK\n");
  });
