import crypto from "node:crypto";
import { generateToken, safeEqual } from "@/src/lib/security/tokens";

/**
 * Núcleo OAuth 2.1 del conector MCP (sin BD). PKCE solo S256, lista cerrada de
 * redirect_uri y tokens opacos que se guardan únicamente como hash SHA-256.
 */

/** RFC 7636 §4.1: 43–128 caracteres "unreserved". */
const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
/** base64url de un SHA-256: 43 caracteres sin relleno. */
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== "S256") return false;
  if (!PKCE_VERIFIER.test(verifier) || !PKCE_CHALLENGE.test(challenge)) return false;
  const computed = crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
  return safeEqual(computed, challenge);
}

export const MAX_REDIRECT_URI_LENGTH = 2048;

/** Callbacks de Claude permitidos (https, host exacto, sin puerto). */
const CLAUDE_HOSTS = new Set(["claude.ai", "claude.com"]);
/** Callbacks locales de Claude Desktop/Code (RFC 8252 §7.3: loopback por http y con puerto). */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Solo acepta la URI en su forma canónica: lo que se valida es exactamente lo que se
 * guarda y a lo que se redirige. Así no cuelan tabuladores, saltos de línea, barras
 * invertidas, mayúsculas en el host, `:443` ni fragmentos (aunque estén vacíos).
 */
export function isAllowedRedirectUri(uri: string): boolean {
  if (!uri || uri.length > MAX_REDIRECT_URI_LENGTH || uri.includes("#")) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.href !== uri) return false;
  if (url.username || url.password) return false;
  if (url.protocol === "https:") {
    return CLAUDE_HOSTS.has(url.hostname) && url.port === "";
  }
  if (url.protocol === "http:") {
    return LOOPBACK_HOSTS.has(url.hostname) && url.port !== "" && url.port !== "0";
  }
  return false;
}

/** SHA-256 en hex minúsculas: lo único que se guarda de un token o un código. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** Token opaco de 32 bytes (base64url, 43 caracteres). */
export function newOpaqueToken(): string {
  return generateToken(32);
}
