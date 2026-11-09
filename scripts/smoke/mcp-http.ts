/**
 * Cableado HTTP del conector MCP, llamando a los manejadores con `Request` reales
 * (sin servidor): metadatos de descubrimiento, registro, token y revocación.
 * AC-1, AC-2.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-http.ts
 */
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { OrganizationContext } from "../../src/server/auth/guards";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/jh_gates(\?|$)/.test(databaseUrl)) {
  throw new Error("mcp-http solo corre contra la base local desechable jh_gates.");
}
const APP = "https://crm.example.test";
process.env.NEXT_PUBLIC_APP_URL = `${APP}/`;
process.env.FEATURE_MCP_CONNECTOR = "true";

const prisma = new PrismaClient();
const MARK = `mcphttp${Date.now()}`;
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
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

function ip() {
  return `10.${crypto.randomInt(255)}.${crypto.randomInt(255)}.${crypto.randomInt(255)}`;
}

function jsonPost(path: string, body: unknown, clientIp = ip()) {
  return new Request(`${APP}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": clientIp },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function formPost(path: string, fields: Record<string, string>) {
  return new Request(`${APP}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() },
    body: new URLSearchParams(fields).toString(),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function makeStaff(): Promise<OrganizationContext> {
  const user = await prisma.user.create({
    data: { email: `${MARK}@example.test`, passwordHash: "x", name: "Http" },
  });
  createdUsers.push(user.id);
  const org = await prisma.organization.create({ data: { name: `TEST JH-CRM ${MARK}` } });
  createdOrgs.push(org.id);
  await prisma.organizationSettings.create({ data: { organizationId: org.id, mcpEnabled: true } });
  await prisma.organizationMember.create({
    data: { userId: user.id, organizationId: org.id, role: "STAFF" },
  });
  return { userId: user.id, organizationId: org.id, role: "STAFF" };
}

async function run() {
  const http = await import("../../src/server/mcp/oauth/http");
  const svc = await import("../../src/server/mcp/oauth/service");

  console.log("\n[mcp-http] metadatos de descubrimiento\n");
  const asRes = http.authorizationServerMetadataResponse();
  const as = await json(asRes);
  check("metadatos del servidor → 200", asRes.status === 200, asRes.status);
  check("issuer = dirección del CRM sin barra final", as.issuer === APP, as.issuer);
  check("authorization_endpoint", as.authorization_endpoint === `${APP}/oauth/authorize`, as.authorization_endpoint);
  check("token_endpoint", as.token_endpoint === `${APP}/api/oauth/token`, as.token_endpoint);
  check("registration_endpoint", as.registration_endpoint === `${APP}/api/oauth/register`, as.registration_endpoint);
  check("revocation_endpoint", as.revocation_endpoint === `${APP}/api/oauth/revoke`, as.revocation_endpoint);
  check(
    "solo PKCE S256",
    JSON.stringify(as.code_challenge_methods_supported) === JSON.stringify(["S256"]),
    as.code_challenge_methods_supported,
  );
  check(
    "cliente público (sin secreto)",
    JSON.stringify(as.token_endpoint_auth_methods_supported) === JSON.stringify(["none"]),
  );
  const prRes = http.protectedResourceMetadataResponse();
  const pr = await json(prRes);
  check("metadatos del recurso → 200", prRes.status === 200);
  check("resource = /api/mcp del CRM", pr.resource === `${APP}/api/mcp`, pr.resource);
  check(
    "authorization_servers apunta al issuer",
    Array.isArray(pr.authorization_servers) && pr.authorization_servers[0] === APP,
    pr.authorization_servers,
  );

  console.log("\n[mcp-http] registro dinámico\n");
  const regRes = await http.handleRegister(
    jsonPost("/api/oauth/register", { client_name: "Claude", redirect_uris: [REDIRECT] }),
  );
  const reg = await json(regRes);
  const clientId = typeof reg.client_id === "string" ? reg.client_id : "";
  if (clientId) createdClients.push(clientId);
  check("registro válido → 201 con client_id", regRes.status === 201 && clientId.length > 0, reg);
  check("registro responde método de auth 'none'", reg.token_endpoint_auth_method === "none");
  const evil = await http.handleRegister(
    jsonPost("/api/oauth/register", { client_name: "x", redirect_uris: ["https://evil.com/cb"] }),
  );
  check("redirect ajeno → 400 invalid_redirect_uri",
    evil.status === 400 && (await json(evil)).error === "invalid_redirect_uri");
  const badJson = await http.handleRegister(jsonPost("/api/oauth/register", "{no es json"));
  check("JSON roto → 400 invalid_client_metadata",
    badJson.status === 400 && (await json(badJson)).error === "invalid_client_metadata");
  const big = await http.handleRegister(
    jsonPost("/api/oauth/register", { client_name: "x", redirect_uris: [REDIRECT], pad: "a".repeat(17 * 1024) }),
  );
  check("cuerpo de más de 16 KB → 413", big.status === 413, big.status);
  const sameIp = ip();
  let last = 0;
  for (let i = 0; i < 11; i += 1) {
    const r = await http.handleRegister(
      jsonPost("/api/oauth/register", { client_name: "x", redirect_uris: [REDIRECT] }, sameIp),
    );
    const body = await json(r);
    if (typeof body.client_id === "string") createdClients.push(body.client_id);
    last = r.status;
    if (i < 10 && r.status !== 201) check(`registro ${i + 1} de la misma IP → 201`, false, r.status);
  }
  check("registro 11 en una hora desde la misma IP → 429", last === 429, last);

  console.log("\n[mcp-http] token\n");
  const staff = await makeStaff();
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const { code } = await svc.approve(staff, {
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const badVerifier = await http.handleToken(
    formPost("/api/oauth/token", {
      grant_type: "authorization_code",
      code,
      code_verifier: crypto.randomBytes(32).toString("base64url"),
      client_id: clientId,
      redirect_uri: REDIRECT,
    }),
  );
  check("verifier malo → 400 invalid_grant",
    badVerifier.status === 400 && (await json(badVerifier)).error === "invalid_grant");
  const tokRes = await http.handleToken(
    formPost("/api/oauth/token", {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: REDIRECT,
    }),
  );
  const tok = await json(tokRes);
  check("canje correcto → 200 con llaves", tokRes.status === 200 && typeof tok.access_token === "string", tok);
  check("respuesta de token sin caché", tokRes.headers.get("cache-control") === "no-store");
  check("token_type Bearer, expires_in 3600", tok.token_type === "Bearer" && tok.expires_in === 3600);
  const noClient = await http.handleToken(
    formPost("/api/oauth/token", { grant_type: "refresh_token", refresh_token: String(tok.refresh_token) }),
  );
  check("sin client_id → 400 invalid_request",
    noClient.status === 400 && (await json(noClient)).error === "invalid_request");
  const unsupported = await http.handleToken(
    formPost("/api/oauth/token", { grant_type: "password", client_id: clientId }),
  );
  check("grant no soportado → 400 unsupported_grant_type",
    unsupported.status === 400 && (await json(unsupported)).error === "unsupported_grant_type");
  const refreshed = await http.handleToken(
    formPost("/api/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: String(tok.refresh_token),
      client_id: clientId,
    }),
  );
  const ref = await json(refreshed);
  check("refresh → 200 con llaves nuevas",
    refreshed.status === 200 && typeof ref.refresh_token === "string" && ref.refresh_token !== tok.refresh_token);

  console.log("\n[mcp-http] revocación\n");
  const rev = await http.handleRevoke(formPost("/api/oauth/revoke", { token: String(ref.refresh_token) }));
  check("revocar → 200", rev.status === 200, rev.status);
  const revUnknown = await http.handleRevoke(formPost("/api/oauth/revoke", { token: "desconocido" }));
  check("revocar token desconocido → 200", revUnknown.status === 200);

  console.log("\n[mcp-http] flag apagado\n");
  process.env.FEATURE_MCP_CONNECTOR = "false";
  check("metadatos con flag apagado → 404", http.authorizationServerMetadataResponse().status === 404);
  check("registro con flag apagado → 404",
    (await http.handleRegister(jsonPost("/api/oauth/register", { redirect_uris: [REDIRECT] }))).status === 404);
  check("token con flag apagado → 404",
    (await http.handleToken(formPost("/api/oauth/token", { grant_type: "refresh_token" }))).status === 404);
  process.env.FEATURE_MCP_CONNECTOR = "true";
}

async function main() {
  console.log("\n[mcp-http] cableado HTTP del conector\n");
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
    console.log("\n✓ mcp-http OK\n");
  });
