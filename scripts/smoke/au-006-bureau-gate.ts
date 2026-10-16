/**
 * AU-006 fail-closed bureau gate.
 *
 *   npm run smoke:au-006-bureau-gate
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUREAU_NOT_CONFIGURED_CODE,
  BUREAU_NOT_CONFIGURED_MESSAGE,
  attemptBureauPull,
  isBureauProviderConfigured,
  resolveBureauProviderId,
} from "../../src/lib/bureau/provider";

const __dirname = dirname(fileURLToPath(import.meta.url));
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

function main() {
  console.log("\n[au-006-bureau-gate] fail-closed\n");

  check("provider defaults to none", resolveBureauProviderId({}) === "none");
  check("not configured by default", !isBureauProviderConfigured({}));

  const r = attemptBureauPull(
    { organizationId: "o", clientId: "c", caseId: "k" },
    {},
  );
  check("pull refused", r.ok === false);
  if (!r.ok) {
    check("code", r.code === BUREAU_NOT_CONFIGURED_CODE);
    check("message constant", r.message === BUREAU_NOT_CONFIGURED_MESSAGE);
  }

  const root = join(__dirname, "../..");
  const serverSrc = readFileSync(
    join(root, "src/server/bureau/pull.ts"),
    "utf8",
  );
  check(
    "server requestBureauPull uses attemptBureauPull",
    serverSrc.includes("attemptBureauPull"),
  );
  check(
    "server throws DomainError on refuse",
    serverSrc.includes("DomainError"),
  );

  const example = readFileSync(join(root, ".env.example"), "utf8");
  check(".env.example documents BUREAU_PROVIDER", example.includes("BUREAU_PROVIDER"));

  if (failed > 0) {
    console.error(`\n[au-006-bureau-gate] ${failed} check(s) failed\n`);
    process.exit(1);
  }
  console.log("\n[au-006-bureau-gate] ok\n");
}

main();
