import { clientIpFromRequest } from "@/src/server/http";
import { RateLimitError } from "@/src/server/errors";
import { assertRateLimit } from "@/src/server/security/rate-limit";
import {
  OAuthError,
  exchangeCode,
  previewRegistration,
  isMcpConnectorFeatureOn,
  refresh,
  registerClient,
  revokeToken,
} from "./service";

/**
 * Capa HTTP del servidor OAuth del conector MCP: funciones puras Request → Response
 * que llaman los route handlers. Nunca registran cuerpos, tokens ni códigos.
 */

export const MAX_REGISTER_BODY_BYTES = 16 * 1024;
const REGISTER_LIMIT_PER_HOUR = 10;
/** Tope global de registros por hora: acota la tabla aunque se falsee la IP de origen. */
export const REGISTER_GLOBAL_LIMIT_PER_HOUR = 100;
export const REGISTER_GLOBAL_WINDOW_SECONDS = 3600;
export const REGISTER_GLOBAL_BUCKET = "mcp-register:global";
const TOKEN_LIMIT_PER_MINUTE = 60;

/** Dirección pública del CRM, sin barra final. Única fuente de URLs absolutas. */
export function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) throw new Error("NEXT_PUBLIC_APP_URL no está configurada.");
  return raw.replace(/\/+$/, "");
}

export function mcpResourceUrl(): string {
  return `${appBaseUrl()}/api/mcp`;
}

export function protectedResourceMetadataUrl(): string {
  return `${appBaseUrl()}/.well-known/oauth-protected-resource`;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Protocol-Version",
};

function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

function oauthError(code: string, status = 400): Response {
  return jsonResponse({ error: code }, status);
}

export function corsPreflightResponse(): Response {
  if (!isMcpConnectorFeatureOn()) return notFound();
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ── Descubrimiento (RFC 8414 y RFC 9728) ───────────────────────────────────

export function authorizationServerMetadataResponse(): Response {
  if (!isMcpConnectorFeatureOn()) return notFound();
  const base = appBaseUrl();
  return jsonResponse({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
  });
}

export function protectedResourceMetadataResponse(): Response {
  if (!isMcpConnectorFeatureOn()) return notFound();
  return jsonResponse({
    resource: mcpResourceUrl(),
    authorization_servers: [appBaseUrl()],
    bearer_methods_supported: ["header"],
    resource_name: "JH CRM",
  });
}

// ── Lectura acotada del cuerpo ─────────────────────────────────────────────

class BodyTooLarge extends Error {}

/** Lee el cuerpo contando bytes y corta en cuanto supera el máximo (también si llega por trozos). */
async function readBody(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new BodyTooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Formulario (lo estándar) o JSON; solo campos de texto. */
async function readParams(request: Request): Promise<Record<string, string>> {
  const text = await readBody(request, MAX_REGISTER_BODY_BYTES);
  const type = request.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (type.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return out;
    }
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
    }
    return out;
  }
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}

async function limit(key: string, max: number, windowSeconds: number): Promise<Response | null> {
  try {
    await assertRateLimit({ key, limit: max, windowSeconds });
    return null;
  } catch (error) {
    if (error instanceof RateLimitError) {
      return jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": String(windowSeconds) });
    }
    throw error;
  }
}

// ── Registro dinámico (RFC 7591) ───────────────────────────────────────────

export async function handleRegister(request: Request): Promise<Response> {
  if (!isMcpConnectorFeatureOn()) return notFound();
  const limited = await limit(`mcp-register:${clientIpFromRequest(request)}`, REGISTER_LIMIT_PER_HOUR, 3600);
  if (limited) return limited;

  let text: string;
  try {
    text = await readBody(request, MAX_REGISTER_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLarge) return oauthError("invalid_client_metadata", 413);
    throw error;
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return oauthError("invalid_client_metadata");
  }
  if (!body || typeof body !== "object") return oauthError("invalid_client_metadata");
  const input = body as { client_name?: unknown; redirect_uris?: unknown };

  // El tope global solo lo gastan registros que se van a crear: la basura no bloquea a Claude.
  const preview = previewRegistration(input);
  if (preview) return oauthError(preview);
  const globalLimited = await limit(REGISTER_GLOBAL_BUCKET, REGISTER_GLOBAL_LIMIT_PER_HOUR, REGISTER_GLOBAL_WINDOW_SECONDS);
  if (globalLimited) return globalLimited;

  try {
    const client = await registerClient({ client_name: input.client_name, redirect_uris: input.redirect_uris });
    return jsonResponse(
      {
        ...client,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      201,
    );
  } catch (error) {
    if (error instanceof OAuthError) return oauthError(error.code);
    throw error;
  }
}

// ── Token ─────────────────────────────────────────────────────────────────

export async function handleToken(request: Request): Promise<Response> {
  if (!isMcpConnectorFeatureOn()) return notFound();
  const limited = await limit(`mcp-token:${clientIpFromRequest(request)}`, TOKEN_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;

  let params: Record<string, string>;
  try {
    params = await readParams(request);
  } catch (error) {
    if (error instanceof BodyTooLarge) return oauthError("invalid_request", 413);
    throw error;
  }
  const grant = params.grant_type;
  if (grant !== "authorization_code" && grant !== "refresh_token") {
    return oauthError(grant ? "unsupported_grant_type" : "invalid_request");
  }
  if (!params.client_id) return oauthError("invalid_request");

  try {
    const tokens =
      grant === "authorization_code"
        ? await exchangeCode({
            code: params.code ?? "",
            code_verifier: params.code_verifier ?? "",
            client_id: params.client_id,
            redirect_uri: params.redirect_uri ?? "",
          })
        : await refresh({ refresh_token: params.refresh_token ?? "", client_id: params.client_id });
    return jsonResponse(tokens, 200, { Pragma: "no-cache" });
  } catch (error) {
    if (error instanceof OAuthError) return oauthError(error.code);
    throw error;
  }
}

// ── Revocación (RFC 7009) ──────────────────────────────────────────────────

export async function handleRevoke(request: Request): Promise<Response> {
  if (!isMcpConnectorFeatureOn()) return notFound();
  const limited = await limit(`mcp-revoke:${clientIpFromRequest(request)}`, TOKEN_LIMIT_PER_MINUTE, 60);
  if (limited) return limited;
  let params: Record<string, string> = {};
  try {
    params = await readParams(request);
  } catch (error) {
    if (!(error instanceof BodyTooLarge)) throw error;
  }
  await revokeToken(params.token ?? "");
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store", ...CORS_HEADERS } });
}
