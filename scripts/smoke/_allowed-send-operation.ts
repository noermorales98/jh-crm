/**
 * Contexto ALLOWED para smokes que deben llamar markRoundSent.
 * No es una política de producción: solo desbloquea el fail-closed sintético.
 */
import type { MarkRoundSentOperation } from "../../src/server/rounds";

export const ALLOWED_SEND_OPERATION: MarkRoundSentOperation = {
  serviceType: "CREDIT_REPAIR",
  asOf: "2026-06-15",
  policy: {
    id: "pol-smoke-send",
    version: 1,
    reviewed: true,
    serviceType: "CREDIT_REPAIR",
    effectiveFrom: "2026-01-01",
    effectiveUntil: "2099-12-31",
    chargeAllowed: false,
  },
  contract: { version: "smoke-1", signed: true },
  authorization: { revokedAt: null },
};
