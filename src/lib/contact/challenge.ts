import crypto from "node:crypto";
import { DomainError } from "@/src/server/errors";
import { safeEqual } from "@/src/lib/security/tokens";

const CHALLENGE_TTL_MS = 30 * 60 * 1000;
const CHALLENGE_MIN_AGE_MS = 1500;

function challengeSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.FIELD_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("AUTH_SECRET no está configurada.");
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", challengeSecret()).update(payload).digest("base64url");
}

export function createMathChallenge(): { token: string; question: string } {
  const a = 2 + crypto.randomInt(8);
  const b = 1 + crypto.randomInt(9);
  const issuedAt = Date.now();
  const payload = `${a}|${b}|${issuedAt}`;
  const token = `${payload}|${sign(payload)}`;
  return {
    token,
    question: `¿Cuánto es ${a} + ${b}?`,
  };
}

export function verifyMathChallenge(token: string, rawAnswer: string): void {
  const parts = token.split("|");
  if (parts.length !== 4) {
    throw new DomainError("La verificación expiró. Recarga e inténtalo de nuevo.");
  }
  const [aRaw, bRaw, issuedRaw, signature] = parts;
  const payload = `${aRaw}|${bRaw}|${issuedRaw}`;
  if (!safeEqual(sign(payload), signature)) {
    throw new DomainError("La verificación no es válida. Recarga e inténtalo de nuevo.");
  }

  const a = Number(aRaw);
  const b = Number(bRaw);
  const issuedAt = Number(issuedRaw);
  if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isFinite(issuedAt)) {
    throw new DomainError("La verificación no es válida. Recarga e inténtalo de nuevo.");
  }

  const age = Date.now() - issuedAt;
  if (age > CHALLENGE_TTL_MS) {
    throw new DomainError("La verificación expiró. Recarga e inténtalo de nuevo.");
  }
  if (age < CHALLENGE_MIN_AGE_MS) {
    throw new DomainError("Envío demasiado rápido. Inténtalo de nuevo.");
  }

  const answer = Number(String(rawAnswer).trim().replace(",", "."));
  if (!Number.isFinite(answer) || answer !== a + b) {
    throw new DomainError("La verificación no es correcta. Inténtalo de nuevo.");
  }
}
