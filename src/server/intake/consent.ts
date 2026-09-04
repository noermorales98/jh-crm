import { createHash } from "node:crypto";
import { DomainError } from "@/src/server/errors";
import { INTAKE_CONSENT } from "@/src/lib/intake/consent";

export function hashIntakeConsentTextNode(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function assertValidIntakeConsent(consent: {
  consentType: string;
  version: string;
  textHash: string;
}): void {
  const expectedHash = hashIntakeConsentTextNode(INTAKE_CONSENT.text);
  if (
    consent.consentType !== INTAKE_CONSENT.consentType ||
    consent.version !== INTAKE_CONSENT.version ||
    consent.textHash.toLowerCase() !== expectedHash
  ) {
    throw new DomainError(
      "El consentimiento no es válido. Recarga la página e inténtalo de nuevo.",
    );
  }
}
