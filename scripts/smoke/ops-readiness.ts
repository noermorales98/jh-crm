/**
 * Ops readiness — env key presence (names only) + AU-006 fail-closed gate.
 * Does not print secret values.
 *
 *   npm run smoke:ops-readiness
 */
import {
  BUREAU_NOT_CONFIGURED_CODE,
  BUREAU_PROVIDER_NONE,
  attemptBureauPull,
  isBureauProviderConfigured,
  resolveBureauProviderId,
} from "../../src/lib/bureau/provider";

let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

/** Required for local/prod CRM boot (names from auditoria 08). */
const REQUIRED_ENV = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "FIELD_ENCRYPTION_KEY",
  "CRON_SECRET",
  "OPENROUTER_API_KEY",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "PUBLIC_ORG_ID",
] as const;

function main() {
  console.log("\n[ops-readiness] env + AU-006 gate\n");

  for (const key of REQUIRED_ENV) {
    const set = Boolean(process.env[key]?.trim());
    // In CI/pure smoke without .env, keys may be missing — report, don't fail hard
    // unless OPS_REQUIRE_ENV=1.
    if (process.env.OPS_REQUIRE_ENV === "1") {
      check(`env ${key} SET`, set);
    } else {
      console.log(`  · env ${key}: ${set ? "SET" : "missing (ok in pure CI)"}`);
    }
  }

  check(
    "default bureau provider is none",
    resolveBureauProviderId({}) === BUREAU_PROVIDER_NONE,
  );
  check(
    "isBureauProviderConfigured false by default",
    !isBureauProviderConfigured({}),
  );

  const refused = attemptBureauPull({
    organizationId: "org_smoke",
    clientId: "cli_smoke",
    caseId: "case_smoke",
  }, {});
  check("attemptBureauPull refuses when none", !refused.ok);
  if (!refused.ok) {
    check(
      "refuse code BUREAU_PROVIDER_NOT_CONFIGURED",
      refused.code === BUREAU_NOT_CONFIGURED_CODE,
    );
    check(
      "refuse message mentions Analizar PDF",
      refused.message.includes("Analizar PDF"),
    );
  }

  const stub = attemptBureauPull(
    {
      organizationId: "org_smoke",
      clientId: "cli_smoke",
      caseId: "case_smoke",
    },
    { BUREAU_PROVIDER: "array" },
  );
  check("unknown stub provider still refuses", !stub.ok);

  if (failed > 0) {
    console.error(`\n[ops-readiness] ${failed} check(s) failed\n`);
    process.exit(1);
  }
  console.log("\n[ops-readiness] ok\n");
}

main();
