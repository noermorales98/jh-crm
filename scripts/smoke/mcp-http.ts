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
const GLOBAL_BUCKET = "mcp-register:global";
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

function chunkedRequest(path: string, parts: string[], clientIp = ip()) {
  const enc = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < parts.length) controller.enqueue(enc.encode(parts[i++]));
      else controller.close();
    },
  });
  return new Request(`${APP}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": clientIp },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

/** JSON de registro válido relleno hasta `bytes` exactos. */
function registerBodyOfSize(bytes: number): string {
  const base = JSON.stringify({ client_name: "x", redirect_uris: [REDIRECT], pad: "" });
  return base.replace('"pad":""', `"pad":"${"a".repeat(bytes - base.length)}"`);
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

async function resetGlobalRegisterBucket() {
  await prisma.rateLimitBucket.deleteMany({ where: { bucketKey: GLOBAL_BUCKET } });
}

async function run() {
  const http = await import("../../src/server/mcp/oauth/http");
  const svc = await import("../../src/server/mcp/oauth/service");
  // El contador global es compartido: la prueba parte de cero y lo deja a cero.
  await resetGlobalRegisterBucket();

  console.log("\n[mcp-http] metadatos de descubrimiento\n");
  const asRes = http.authorizationServerMetadataResponse();
  const as = await json(asRes);
  check("metadatos del servidor → 200", asRes.status === 200, asRes.status);
  check("metadatos sin caché", asRes.headers.get("cache-control") === "no-store");
  check("metadatos con CORS abierto (sin cookies)", asRes.headers.get("access-control-allow-origin") === "*");
  const pre = http.corsPreflightResponse();
  check("preflight OPTIONS → 204 con métodos", pre.status === 204 &&
    (pre.headers.get("access-control-allow-methods") ?? "").includes("POST"));
  const allowHeaders = (pre.headers.get("access-control-allow-headers") ?? "").toLowerCase();
  check("preflight permite Authorization y Mcp-Protocol-Version",
    allowHeaders.includes("authorization") && allowHeaders.includes("mcp-protocol-version"), allowHeaders);
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
  check("registro sin caché", regRes.headers.get("cache-control") === "no-store");
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
  // Cuerpo por trozos, sin Content-Length: se corta al pasar de 16 KB.
  let pulled = 0;
  const chunk = new TextEncoder().encode("a".repeat(4096));
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      if (pulled > 256) controller.close();
      else controller.enqueue(chunk);
    },
  });
  const chunked = await http.handleRegister(
    new Request(`${APP}/api/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip() },
      body: stream,
      duplex: "half",
    } as RequestInit),
  );
  check("cuerpo por trozos de 1 MB → 413", chunked.status === 413, chunked.status);
  check("…sin leerlo entero (corta pronto)", pulled < 16, pulled);
  const exact = registerBodyOfSize(16 * 1024);
  const atLimit = await http.handleRegister(jsonPost("/api/oauth/register", exact));
  const atLimitBody = await json(atLimit);
  if (typeof atLimitBody.client_id === "string") createdClients.push(atLimitBody.client_id);
  check("cuerpo de exactamente 16 KB → se acepta (201)", atLimit.status === 201, atLimit.status);
  const over = await http.handleRegister(jsonPost("/api/oauth/register", registerBodyOfSize(16 * 1024 + 1)));
  check("cuerpo de 16 KB + 1 byte → 413", over.status === 413, over.status);
  const five = registerBodyOfSize(5 * 1024);
  const twoChunks = await http.handleRegister(
    chunkedRequest("/api/oauth/register", [five.slice(0, 2500), five.slice(2500)]),
  );
  const twoBody = await json(twoChunks);
  if (typeof twoBody.client_id === "string") createdClients.push(twoBody.client_id);
  check("cuerpo válido en 2 trozos → 201 (se lee entero)", twoChunks.status === 201, twoChunks.status);
  const multibyte = JSON.stringify({ client_name: "Claude ñandú", redirect_uris: [REDIRECT] });
  const cut = multibyte.indexOf("ñ") + 1; // parte el carácter de 2 bytes entre trozos
  const enc = new TextEncoder().encode(multibyte);
  const splitAt = new TextEncoder().encode(multibyte.slice(0, cut - 1)).length + 1;
  const mbStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.slice(0, splitAt));
      controller.enqueue(enc.slice(splitAt));
      controller.close();
    },
  });
  const mb = await http.handleRegister(
    new Request(`${APP}/api/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip() },
      body: mbStream,
      duplex: "half",
    } as RequestInit),
  );
  const mbBody = await json(mb);
  if (typeof mbBody.client_id === "string") createdClients.push(mbBody.client_id);
  check("carácter de 2 bytes partido entre trozos → nombre intacto", mbBody.client_name === "Claude ñandú", mbBody.client_name);
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
  const retry = await http.handleRegister(
    jsonPost("/api/oauth/register", { client_name: "x", redirect_uris: [REDIRECT] }, sameIp),
  );
  check("el 429 del registro pide esperar una hora", retry.headers.get("retry-after") === "3600");

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
  check("respuesta de token con Pragma no-cache", tokRes.headers.get("pragma") === "no-cache");
  const noClientCode = await http.handleToken(
    formPost("/api/oauth/token", { grant_type: "authorization_code", code: "x", code_verifier: verifier }),
  );
  check("canje sin client_id → 400 invalid_request",
    noClientCode.status === 400 && (await json(noClientCode)).error === "invalid_request");
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
  // Cuerpo JSON en lugar de formulario: también se acepta.
  const refreshed = await http.handleToken(
    jsonPost("/api/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: String(tok.refresh_token),
      client_id: clientId,
    }),
  );
  const ref = await json(refreshed);
  check("refresh con cuerpo JSON → 200 con llaves nuevas",
    refreshed.status === 200 && typeof ref.refresh_token === "string" && ref.refresh_token !== tok.refresh_token);

  const bigToken = await http.handleToken(
    new Request(`${APP}/api/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() },
      body: `grant_type=refresh_token&client_id=x&pad=${"a".repeat(17 * 1024)}`,
    }),
  );
  check("token con cuerpo de más de 16 KB → 413", bigToken.status === 413, bigToken.status);
  const tokenIp = ip();
  let tokenLast = 0;
  let tokenEarly429 = false;
  for (let i = 0; i < 61; i += 1) {
    const r = await http.handleToken(
      new Request(`${APP}/api/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": tokenIp },
        body: "grant_type=refresh_token&client_id=x&refresh_token=y",
      }),
    );
    tokenLast = r.status;
    if (i < 60 && r.status === 429) tokenEarly429 = true;
  }
  check("las primeras 60 peticiones de token no se limitan", !tokenEarly429);
  check("petición 61 de token en un minuto desde la misma IP → 429", tokenLast === 429, tokenLast);

  console.log("\n[mcp-http] revocación\n");
  const rev = await http.handleRevoke(formPost("/api/oauth/revoke", { token: String(ref.refresh_token) }));
  check("revocar → 200", rev.status === 200, rev.status);
  const afterRevoke = await http.handleToken(
    formPost("/api/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: String(ref.refresh_token),
      client_id: clientId,
    }),
  );
  check("tras revocar, ese refresh → 400 invalid_grant",
    afterRevoke.status === 400 && (await json(afterRevoke)).error === "invalid_grant");
  const revUnknown = await http.handleRevoke(formPost("/api/oauth/revoke", { token: "desconocido" }));
  check("revocar token desconocido → 200", revUnknown.status === 200);
  check("revocar responde sin caché y con CORS",
    revUnknown.headers.get("cache-control") === "no-store" &&
      revUnknown.headers.get("access-control-allow-origin") === "*");
  const revBig = await http.handleRevoke(
    new Request(`${APP}/api/oauth/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() },
      body: `token=${"a".repeat(17 * 1024)}`,
    }),
  );
  check("revocar con cuerpo de más de 16 KB → 200 (RFC 7009)", revBig.status === 200, revBig.status);
  const revIp = ip();
  let revLast = 0;
  let revEarly429 = false;
  for (let i = 0; i < 61; i += 1) {
    const r = await http.handleRevoke(
      new Request(`${APP}/api/oauth/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": revIp },
        body: "token=x",
      }),
    );
    revLast = r.status;
    if (i < 60 && r.status === 429) revEarly429 = true;
  }
  check("las primeras 60 revocaciones no se limitan", !revEarly429);
  check("revocación 61 en un minuto desde la misma IP → 429", revLast === 429, revLast);

  console.log("\n[mcp-http] petición de autorización (pantalla de consentimiento)\n");
  const authz = await import("../../src/server/mcp/oauth/authorize");
  const good = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "st-1",
    resource: `${APP}/api/mcp`,
  };
  const parsed = authz.parseAuthorizeParams(good);
  check("petición válida → se acepta", parsed.ok && parsed.value.state === "st-1");
  check("petición válida → campos en su sitio",
    parsed.ok && parsed.value.req.client_id === clientId && parsed.value.req.redirect_uri === REDIRECT &&
      parsed.value.req.code_challenge === challenge && parsed.value.req.code_challenge_method === "S256");
  for (const key of ["redirect_uri", "code_challenge", "code_challenge_method", "response_type"] as const) {
    check(`sin ${key} → rechazada`, !authz.parseAuthorizeParams({ ...good, [key]: undefined }).ok);
  }
  check("state repetido → rechazada", !authz.parseAuthorizeParams({ ...good, state: ["a", "b"] }).ok);
  check("resource repetido → rechazada",
    !authz.parseAuthorizeParams({ ...good, resource: [`${APP}/api/mcp`, "https://evil.com"] }).ok);
  check("resource /api/mcpX → rechazada", !authz.parseAuthorizeParams({ ...good, resource: `${APP}/api/mcpX` }).ok);
  check("resource /api/mcp/otro → rechazada",
    !authz.parseAuthorizeParams({ ...good, resource: `${APP}/api/mcp/otro` }).ok);
  check("resource = raíz del CRM → rechazada", !authz.parseAuthorizeParams({ ...good, resource: APP }).ok);
  check("state de 512 exactos → se acepta", authz.parseAuthorizeParams({ ...good, state: "s".repeat(512) }).ok);
  check("sin response_type=code → rechazada", !authz.parseAuthorizeParams({ ...good, response_type: "token" }).ok);
  check("resource de otro servidor → rechazada",
    !authz.parseAuthorizeParams({ ...good, resource: "https://evil.com/api/mcp" }).ok);
  check("sin resource → se acepta", authz.parseAuthorizeParams({ ...good, resource: undefined }).ok);
  check("parámetro repetido → rechazada",
    !authz.parseAuthorizeParams({ ...good, redirect_uri: [REDIRECT, "https://claude.com/cb"] }).ok);
  check("sin client_id → rechazada", !authz.parseAuthorizeParams({ ...good, client_id: undefined }).ok);
  check("state de más de 512 → rechazada", !authz.parseAuthorizeParams({ ...good, state: "s".repeat(513) }).ok);
  const ok = new URL(authz.buildAuthorizationRedirect(REDIRECT, { code: "c0de" }, "st-1"));
  check("vuelta con code, state e iss",
    ok.origin + ok.pathname === REDIRECT && ok.searchParams.get("code") === "c0de" &&
      ok.searchParams.get("state") === "st-1" && ok.searchParams.get("iss") === APP, ok.toString());
  const denied = new URL(authz.buildAuthorizationRedirect(REDIRECT, { error: "access_denied" }, null));
  check("vuelta denegada con error y sin state",
    denied.searchParams.get("error") === "access_denied" && !denied.searchParams.has("state") &&
      !denied.searchParams.has("code"));
  const injected = new URL(authz.buildAuthorizationRedirect(REDIRECT, { code: "c" }, "a&code=evil"));
  const withQuery = new URL(
    authz.buildAuthorizationRedirect(`${REDIRECT}?keep=1&code=viejo`, { code: "nuevo" }, ""),
  );
  check("vuelta conserva la query propia y deja un solo code",
    withQuery.searchParams.get("keep") === "1" && withQuery.searchParams.getAll("code").join() === "nuevo");
  check("state vacío se devuelve igual", withQuery.searchParams.has("state") && withQuery.searchParams.get("state") === "");
  const hiddenFields = authz.authorizeHiddenFields({ ...good, $ACTION_KEY: "x", otro: "y" });
  check("campos ocultos: solo los 7 de OAuth",
    hiddenFields.every((f) => (authz.AUTHORIZE_FIELDS as readonly string[]).includes(f.key)) &&
      hiddenFields.length === 7, hiddenFields.map((f) => f.key));
  check("destino visible: claude.ai", authz.redirectDestinationLabel(REDIRECT) === "claude.ai");
  check("destino visible: este ordenador para loopback",
    authz.redirectDestinationLabel("http://127.0.0.1:6274/cb").startsWith("este ordenador"));
  check("state con '&' no inyecta parámetros",
    injected.searchParams.getAll("code").length === 1 && injected.searchParams.get("state") === "a&code=evil");

  console.log("\n[mcp-http] botones de la pantalla de consentimiento\n");
  const consent = await import("../../src/server/mcp/oauth/consent");
  const v2 = crypto.randomBytes(32).toString("base64url");
  const ch2 = crypto.createHash("sha256").update(v2).digest("base64url");
  const base2 = {
    response_type: "code", client_id: clientId, redirect_uri: REDIRECT,
    code_challenge: ch2, code_challenge_method: "S256", state: "st-2",
  };
  const okApprove = await consent.decideApprove(staff, base2);
  check("Permitir con datos válidos → vuelve a Claude con code",
    okApprove.kind === "redirect" && new URL(okApprove.url).searchParams.has("code") &&
      okApprove.url.startsWith(REDIRECT));
  check("Permitir devuelve el state a Claude",
    okApprove.kind === "redirect" && new URL(okApprove.url).searchParams.get("state") === "st-2");
  const forgedApprove = await consent.decideApprove(staff, { ...base2, redirect_uri: "https://claude.com/api/mcp/auth_callback" });
  check("Permitir con redirect_uri no registrada → vuelve a la pantalla (no redirige)", forgedApprove.kind === "back");
  const evilApprove = await consent.decideApprove(staff, { ...base2, redirect_uri: "https://evil.test/cb" });
  check("Permitir con redirect_uri ajena → vuelve a la pantalla", evilApprove.kind === "back");
  const unknownClient = await consent.decideApprove(staff, { ...base2, client_id: "desconocido" });
  check("Permitir con cliente desconocido → vuelve a la pantalla", unknownClient.kind === "back");
  await prisma.organizationSettings.update({ where: { organizationId: staff.organizationId }, data: { mcpEnabled: false } });
  const offApprove = await consent.decideApprove(staff, base2);
  check("Permitir con el conector apagado → vuelve a Claude con access_denied",
    offApprove.kind === "redirect" && new URL(offApprove.url).searchParams.get("error") === "access_denied" &&
      offApprove.url.startsWith(REDIRECT));
  check("…también con el state",
    offApprove.kind === "redirect" && new URL(offApprove.url).searchParams.get("state") === "st-2");
  const offForged = await consent.decideApprove(staff, { ...base2, redirect_uri: "https://evil.test/cb" });
  check("…pero nunca a una redirect_uri no registrada", offForged.kind === "back");
  await prisma.organizationSettings.update({ where: { organizationId: staff.organizationId }, data: { mcpEnabled: true } });
  const deny = await consent.decideDeny(base2);
  check("Cancelar → vuelve a Claude con access_denied y state",
    deny.kind === "redirect" && new URL(deny.url).searchParams.get("error") === "access_denied" &&
      new URL(deny.url).searchParams.get("state") === "st-2" && deny.url.startsWith(REDIRECT));
  const denyForged = await consent.decideDeny({ ...base2, redirect_uri: "https://evil.test/cb" });
  check("Cancelar con redirect_uri no registrada → vuelve a la pantalla", denyForged.kind === "back");
  check("Cancelar con petición mal formada → vuelve a la pantalla",
    (await consent.decideDeny({ ...base2, response_type: "token" })).kind === "back");

  console.log("\n[mcp-http] rutas de Next y redirecciones\n");
  const tokenRoute = await import("../../app/api/oauth/token/route");
  const tr = await tokenRoute.POST(formPost("/api/oauth/token", { grant_type: "password", client_id: "x" }));
  check("app/api/oauth/token llama al manejador de token",
    tr.status === 400 && (await json(tr)).error === "unsupported_grant_type");
  const registerRoute = await import("../../app/api/oauth/register/route");
  const rr = await registerRoute.POST(jsonPost("/api/oauth/register", { redirect_uris: ["https://evil.com/x"] }));
  check("app/api/oauth/register llama al manejador de registro",
    rr.status === 400 && (await json(rr)).error === "invalid_redirect_uri");
  const revokeRoute = await import("../../app/api/oauth/revoke/route");
  const vr = await revokeRoute.POST(formPost("/api/oauth/revoke", { token: "x" }));
  check("app/api/oauth/revoke llama al manejador de revocación", vr.status === 200 && (await vr.text()) === "");
  const asRoute = await import("../../app/api/oauth/authorization-server/route");
  check("app/api/oauth/authorization-server sirve los metadatos del servidor",
    (await json(asRoute.GET())).issuer === APP);
  const prRoute = await import("../../app/api/oauth/protected-resource/route");
  check("app/api/oauth/protected-resource sirve los metadatos del recurso",
    (await json(prRoute.GET())).resource === `${APP}/api/mcp`);
  for (const [name, mod] of [
    ["token", tokenRoute],
    ["register", registerRoute],
    ["revoke", revokeRoute],
    ["authorization-server", asRoute],
    ["protected-resource", prRoute],
  ] as const) {
    const options = (mod as { OPTIONS?: () => Response }).OPTIONS;
    check(`app/api/oauth/${name} responde al preflight OPTIONS`, typeof options === "function" && options().status === 204);
  }
  const nextConfig = (await import("../../next.config")).default;
  const rewrites = (await nextConfig.rewrites?.()) as unknown as Array<{ source: string; destination: string }>;
  const dest = (source: string) => rewrites.find((r) => r.source === source)?.destination;
  const headerRules = (await nextConfig.headers?.()) ?? [];
  const consentHeaders = headerRules.find((r) => r.source === "/oauth/authorize")?.headers ?? [];
  const hval = (k: string) => consentHeaders.find((h) => h.key === k)?.value;
  check("consentimiento no incrustable (CSP frame-ancestors 'none' + X-Frame-Options DENY)",
    hval("Content-Security-Policy") === "frame-ancestors 'none'" && hval("X-Frame-Options") === "DENY");
  check("/.well-known/oauth-authorization-server → /api/oauth/authorization-server",
    dest("/.well-known/oauth-authorization-server") === "/api/oauth/authorization-server");
  check("/.well-known/oauth-protected-resource → /api/oauth/protected-resource",
    dest("/.well-known/oauth-protected-resource") === "/api/oauth/protected-resource");
  check("/.well-known/oauth-protected-resource/:path* → /api/oauth/protected-resource",
    dest("/.well-known/oauth-protected-resource/:path*") === "/api/oauth/protected-resource");

  console.log("\n[mcp-http] tope global de registros\n");
  await resetGlobalRegisterBucket();
  for (const junk of ["{", JSON.stringify({ redirect_uris: ["https://evil.com/cb"] }), registerBodyOfSize(17 * 1024)]) {
    await http.handleRegister(jsonPost("/api/oauth/register", junk));
  }
  check("peticiones basura no gastan el tope global",
    (await prisma.rateLimitBucket.count({ where: { bucketKey: http.REGISTER_GLOBAL_BUCKET } })) === 0);
  let created = 0;
  let firstRefusal = 0;
  for (let i = 0; i < http.REGISTER_GLOBAL_LIMIT_PER_HOUR + 1; i += 1) {
    const r = await http.handleRegister(
      jsonPost("/api/oauth/register", { client_name: "x", redirect_uris: [REDIRECT] }),
    );
    const body = await json(r);
    if (typeof body.client_id === "string") createdClients.push(body.client_id);
    if (r.status === 201) created += 1;
    else if (!firstRefusal) firstRefusal = r.status;
  }
  check(`con IPs distintas, solo ${http.REGISTER_GLOBAL_LIMIT_PER_HOUR} registros por hora`,
    created === http.REGISTER_GLOBAL_LIMIT_PER_HOUR, created);
  check("el siguiente → 429", firstRefusal === 429, firstRefusal);
  const bucket = await prisma.rateLimitBucket.findFirst({ where: { bucketKey: http.REGISTER_GLOBAL_BUCKET } });
  check("la ventana del tope global es de una hora",
    http.REGISTER_GLOBAL_WINDOW_SECONDS === 3600 && !!bucket && bucket.windowStart.getTime() % 3_600_000 === 0,
    bucket?.windowStart);

  console.log("\n[mcp-http] flag apagado\n");
  process.env.FEATURE_MCP_CONNECTOR = "false";
  check("metadatos con flag apagado → 404", http.authorizationServerMetadataResponse().status === 404);
  check("registro con flag apagado → 404",
    (await http.handleRegister(jsonPost("/api/oauth/register", { redirect_uris: [REDIRECT] }))).status === 404);
  check("token con flag apagado → 404",
    (await http.handleToken(formPost("/api/oauth/token", { grant_type: "refresh_token" }))).status === 404);
  check("metadatos del recurso con flag apagado → 404", http.protectedResourceMetadataResponse().status === 404);
  check("revocar con flag apagado → 404",
    (await http.handleRevoke(formPost("/api/oauth/revoke", { token: "x" }))).status === 404);
  check("preflight con flag apagado → 404", http.corsPreflightResponse().status === 404);
  process.env.FEATURE_MCP_CONNECTOR = "true";
}

async function main() {
  console.log("\n[mcp-http] cableado HTTP del conector\n");
  try {
    await run();
  } finally {
    await resetGlobalRegisterBucket().catch(() => undefined);
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
