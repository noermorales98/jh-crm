import { INTAKE_CONSENT } from "../../src/lib/intake/consent";
import {
  assertValidIntakeConsent,
  hashIntakeConsentTextNode,
} from "../../src/server/intake/consent";
import { assertRateLimit } from "../../src/server/security/rate-limit";
import { RateLimitError } from "../../src/server/errors";

async function main() {
  const h = hashIntakeConsentTextNode(INTAKE_CONSENT.text);
  assertValidIntakeConsent({
    consentType: INTAKE_CONSENT.consentType,
    version: INTAKE_CONSENT.version,
    textHash: h,
  });
  try {
    assertValidIntakeConsent({
      consentType: INTAKE_CONSENT.consentType,
      version: INTAKE_CONSENT.version,
      textHash: "0".repeat(64),
    });
    throw new Error("CONSENT_FAIL");
  } catch (e) {
    if (e instanceof Error && e.message === "CONSENT_FAIL") throw e;
    console.log("CONSENT_REJECT_OK");
  }

  const key = `smoke:rate:${Date.now()}`;
  for (let i = 0; i < 3; i += 1) {
    await assertRateLimit({ key, limit: 3, windowSeconds: 60 });
  }
  try {
    await assertRateLimit({ key, limit: 3, windowSeconds: 60 });
    throw new Error("RATE_FAIL");
  } catch (e) {
    if (!(e instanceof RateLimitError)) throw e;
    console.log("RATE_LIMIT_OK");
  }
  console.log("INTAKE_PROD_HARDENING: OK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
