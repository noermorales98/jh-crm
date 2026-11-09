import { appBaseUrl, mcpResourceUrl } from "./http";
import type { AuthorizeRequest } from "./service";

/**
 * Pantalla de consentimiento del conector MCP: interpreta la petición de Claude y
 * construye la vuelta a Claude. Sin BD; la validación contra el cliente registrado la
 * hace `validateAuthorizeRequest` del servicio.
 */

export interface ParsedAuthorize {
  req: AuthorizeRequest;
  state: string | null;
}

export type ParseResult = { ok: true; value: ParsedAuthorize } | { ok: false };

type Params = Record<string, string | string[] | undefined>;

function single(params: Params, key: string): string | null {
  const value = params[key];
  if (Array.isArray(value)) return null;
  return typeof value === "string" ? value : null;
}

/** Campos OAuth que viajan en la pantalla de consentimiento (nada más). */
export const AUTHORIZE_FIELDS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "resource",
] as const;

export const MAX_STATE_LENGTH = 512;

export function parseAuthorizeParams(params: Params): ParseResult {
  // Un parámetro repetido es ambiguo: se rechaza (RFC 6749 §3.1).
  for (const key of AUTHORIZE_FIELDS) {
    if (Array.isArray(params[key])) return { ok: false };
  }
  if (single(params, "response_type") !== "code") return { ok: false };
  const client_id = single(params, "client_id");
  const redirect_uri = single(params, "redirect_uri");
  const code_challenge = single(params, "code_challenge");
  const code_challenge_method = single(params, "code_challenge_method");
  if (!client_id || !redirect_uri || !code_challenge || !code_challenge_method) return { ok: false };
  const state = single(params, "state");
  if (state !== null && state.length > MAX_STATE_LENGTH) return { ok: false };
  // RFC 8707: si Claude dice para qué recurso pide la llave, tiene que ser este conector.
  const resource = single(params, "resource");
  if (resource !== null && resource !== mcpResourceUrl()) return { ok: false };
  return {
    ok: true,
    value: { req: { client_id, redirect_uri, code_challenge, code_challenge_method }, state },
  };
}

/** Solo los campos OAuth, para los campos ocultos del formulario. */
export function authorizeHiddenFields(params: Params): Array<{ key: string; value: string }> {
  return AUTHORIZE_FIELDS.flatMap((key) => {
    const value = single(params, key);
    return value === null ? [] : [{ key, value }];
  });
}

/**
 * A dónde volverá la persona tras aceptar. El nombre del cliente lo elige quien se
 * registra; el destino no se puede falsear, así que se muestra junto al nombre.
 */
export function redirectDestinationLabel(redirectUri: string): string {
  const url = new URL(redirectUri);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return "este ordenador (Claude Desktop o Claude Code)";
  return url.hostname;
}

/** Vuelta a Claude con `code` o `error`, más `state` e `iss` (RFC 9207). */
export function buildAuthorizationRedirect(
  redirectUri: string,
  result: { code: string } | { error: "access_denied" },
  state: string | null,
): string {
  const url = new URL(redirectUri);
  if ("code" in result) url.searchParams.set("code", result.code);
  else url.searchParams.set("error", result.error);
  if (state !== null) url.searchParams.set("state", state);
  url.searchParams.set("iss", appBaseUrl());
  return url.toString();
}
