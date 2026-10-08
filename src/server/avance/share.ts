import crypto from "node:crypto";
import { DomainError } from "@/src/server/errors";
import { safeEqual } from "@/src/lib/security/tokens";

/** Link de Vista cliente: válido ~180 días. */
const TTL_MS = 180 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.FIELD_ENCRYPTION_KEY;
  if (!s) throw new Error("AUTH_SECRET no está configurada.");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = process.env.VERCEL_URL?.trim();
  if (host) return `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export function createAvanceShareToken(
  organizationId: string,
  clientId: string,
): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${organizationId}.${clientId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyAvanceShareToken(token: string): {
  organizationId: string;
  clientId: string;
} {
  const parts = token.split(".");
  if (parts.length !== 4) {
    throw new DomainError("Enlace de avance no válido.");
  }
  const [organizationId, clientId, expRaw, signature] = parts;
  if (!organizationId || !clientId || !expRaw || !signature) {
    throw new DomainError("Enlace de avance no válido.");
  }
  const payload = `${organizationId}.${clientId}.${expRaw}`;
  if (!safeEqual(sign(payload), signature)) {
    throw new DomainError("Enlace de avance no válido.");
  }
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || Date.now() > exp) {
    throw new DomainError("Este enlace de avance expiró. Pide uno nuevo a tu asesor.");
  }
  return { organizationId, clientId };
}

export function avanceShareUrl(organizationId: string, clientId: string): string {
  const token = createAvanceShareToken(organizationId, clientId);
  return `${appBaseUrl()}/a/${encodeURIComponent(token)}`;
}
