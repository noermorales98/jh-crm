/**
 * Pure gate checks for smoke org allowlist (no DB required).
 *
 *   npm run smoke:smoke-safe-org
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSmokeSafeOrgName,
  isTruthyEnv,
  pickSmokeOrg,
  SMOKE_PROD_JH_NEEDLE,
  SMOKE_TEST_ORG_NEEDLE,
} from "./_lib/resolve-smoke-org";

const __dirname = dirname(fileURLToPath(import.meta.url));

let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

function expectThrow(label: string, fn: () => unknown) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${label} (expected throw)`);
  } catch {
    console.log(`  ✓ ${label}`);
  }
}

function main() {
  console.log("\n[smoke-safe-org] allowlist / pickSmokeOrg\n");

  check("truthy 1", isTruthyEnv("1"));
  check("truthy true", isTruthyEnv("true"));
  check("falsy empty", !isTruthyEnv(""));
  check("falsy 0", !isTruthyEnv("0"));

  check(
    "TEST JH-CRM is safe",
    isSmokeSafeOrgName("TEST JH-CRM portal mmvb"),
  );
  check(
    "live JH refused by default",
    !isSmokeSafeOrgName("J&H Multiservices LLC"),
  );
  check(
    "live JH allowed with flag",
    isSmokeSafeOrgName("J&H Multiservices LLC", { allowJh: true }),
  );
  check(
    "explicit non-JH SMOKE_ORG_NAME allowed",
    isSmokeSafeOrgName("PRUEBA Sandbox", {
      smokeOrgName: "PRUEBA Sandbox",
    }),
  );
  check(
    "explicit JH SMOKE_ORG_NAME still needs allowJh",
    !isSmokeSafeOrgName("J&H Multiservices LLC", {
      smokeOrgName: "J&H Multiservices LLC",
    }),
  );

  const orgs = [
    { id: "1", name: "J&H Multiservices LLC" },
    { id: "2", name: "TEST JH-CRM demo" },
    { id: "3", name: "Other Co" },
  ];

  const picked = pickSmokeOrg(orgs);
  check("default picks TEST JH-CRM", picked.id === "2", picked);

  const named = pickSmokeOrg(orgs, { smokeOrgName: "TEST JH-CRM demo" });
  check("SMOKE_ORG_NAME exact", named.id === "2");

  const jh = pickSmokeOrg(orgs, { allowJh: true });
  check(
    "allowJh falls back to JH when no preference",
    // TEST still wins when present
    jh.id === "2",
    jh,
  );

  const onlyJh = [{ id: "1", name: "J&H Multiservices LLC" }];
  const jhOnly = pickSmokeOrg(onlyJh, { allowJh: true });
  check("allowJh + only JH", jhOnly.id === "1");

  expectThrow("refuse JH without flag", () => pickSmokeOrg(onlyJh));
  expectThrow("refuse missing SMOKE_ORG_NAME", () =>
    pickSmokeOrg(orgs, { smokeOrgName: "Does Not Exist" }),
  );
  expectThrow("refuse JH via SMOKE_ORG_NAME without flag", () =>
    pickSmokeOrg(orgs, { smokeOrgName: "J&H Multiservices LLC" }),
  );
  expectThrow("refuse empty catalog", () => pickSmokeOrg([]));

  check(
    "needles exported",
    SMOKE_TEST_ORG_NEEDLE.includes("TEST") &&
      SMOKE_PROD_JH_NEEDLE.includes("J&H"),
  );

  // Source guard: e2e-flow + letters-smoke must not hardcode live JH name.
  const root = join(__dirname, "../..");
  for (const rel of [
    "scripts/smoke/e2e-flow.ts",
    "scripts/smoke/letters-smoke.ts",
  ]) {
    const src = readFileSync(join(root, rel), "utf8");
    check(`${rel} uses resolveSmokeOrg`, src.includes("resolveSmokeOrg"));
    check(
      `${rel} no hardcoded J&H Multiservices LLC lookup`,
      !src.includes('name: "J&H Multiservices LLC"'),
    );
  }

  console.log(`\nResultado: ${failed === 0 ? "PASS" : "FAIL"} (${failed} fallos)`);
  if (failed > 0) process.exitCode = 1;
}

main();
