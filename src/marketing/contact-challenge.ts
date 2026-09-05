/**
 * Carga compartida del reto anti-robot del formulario de contacto.
 * Evita N GETs cuando hay 2 formularios en la landing (hero + full)
 * y cuando React Strict Mode monta dos veces en desarrollo.
 */

type ChallengePayload = { token: string };

let inflight: Promise<ChallengePayload> | null = null;
let cached: { token: string; expiresAt: number } | null = null;

const CACHE_MS = 45_000;

export async function loadContactChallenge(): Promise<ChallengePayload> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return { token: cached.token };
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch("/api/public/contact", { cache: "no-store" });
    const data = (await res.json()) as {
      ok?: boolean;
      token?: string;
      error?: string;
    };
    if (!res.ok || !data.token) {
      throw new Error(data.error ?? "No se pudo cargar la verificación.");
    }
    cached = { token: data.token, expiresAt: Date.now() + CACHE_MS };
    return { token: data.token };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Invalida caché tras envío exitoso o error (nuevo reto). */
export function invalidateContactChallenge() {
  cached = null;
}
