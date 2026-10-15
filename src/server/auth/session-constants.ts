/**
 * TTL de sesión JWT (staff + portal).
 *
 * JH-005 / PR-002 — valor aprobado para alcance P0 (2026-10-15):
 * **30 días** (2_592_000 s). Antes era ~10 años; la invalidación operativa
 * sigue siendo `sessionVersion` / `isActive` (staff) y revocación portal.
 *
 * Override opcional: `SESSION_MAX_AGE_SECONDS` (entero positivo en env).
 */
const DAY = 60 * 60 * 24;
const DEFAULT_SESSION_MAX_AGE_SECONDS = DAY * 30;

function parseMaxAge(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export const SESSION_MAX_AGE_SECONDS = parseMaxAge(
  process.env.SESSION_MAX_AGE_SECONDS,
  DEFAULT_SESSION_MAX_AGE_SECONDS,
);

/** Documentado para smoke/TEST-004: default sin override de env. */
export const SESSION_MAX_AGE_SECONDS_DEFAULT = DEFAULT_SESSION_MAX_AGE_SECONDS;

/**
 * Portal: mismo techo JWT que staff (NextAuth maxAge global).
 * Revocación inmediata vía `ClientPortalAccess.sessionVersion` / isActive.
 * Default documentado: 7 días si en el futuro se separa cookie; hoy = staff TTL.
 */
export const PORTAL_SESSION_MAX_AGE_SECONDS_DEFAULT = DAY * 7;
