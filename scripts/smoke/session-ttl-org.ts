/**
 * TEST-004 (parcial, sin DB) — TTL documentado + resolución de org + revocación lógica.
 *
 * Uso: npx tsx scripts/smoke/session-ttl-org.ts
 *      npm run smoke:session-ttl-org
 */
import { isTokenSessionCurrent } from "../../src/server/auth/session";
import {
  PORTAL_SESSION_MAX_AGE_SECONDS_DEFAULT,
  SESSION_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS_DEFAULT,
} from "../../src/server/auth/session-constants";
import { resolveActiveMembership } from "../../src/server/auth/resolve-active-membership";

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

console.log("\n[TEST-004] session TTL + org resolve");

const DAY = 60 * 60 * 24;
check(
  "default TTL = 30 días (JH-005)",
  SESSION_MAX_AGE_SECONDS_DEFAULT === DAY * 30,
);
check(
  "SESSION_MAX_AGE_SECONDS activo es positivo",
  SESSION_MAX_AGE_SECONDS > 0 && SESSION_MAX_AGE_SECONDS <= DAY * 365,
);
check(
  "portal default documentado = 7 días",
  PORTAL_SESSION_MAX_AGE_SECONDS_DEFAULT === DAY * 7,
);

check("token fresco válido", isTokenSessionCurrent(3, 3));
check("token sin versión inválido", !isTokenSessionCurrent(undefined, 3));
check("token versión vieja inválido", !isTokenSessionCurrent(2, 3));

const only = resolveActiveMembership([
  { organizationId: "org-a", role: "STAFF", createdAt: new Date("2020-01-01") },
]);
check("única membresía", only?.organizationId === "org-a");

const byDefault = resolveActiveMembership(
  [
    { organizationId: "org-a", role: "OWNER", createdAt: new Date("2020-01-01") },
    { organizationId: "org-b", role: "STAFF", createdAt: new Date("2019-01-01") },
  ],
  { defaultOrganizationId: "org-b" },
);
check("default org gana", byDefault?.organizationId === "org-b");

const byRole = resolveActiveMembership([
  { organizationId: "org-staff", role: "STAFF", createdAt: new Date("2018-01-01") },
  { organizationId: "org-owner", role: "OWNER", createdAt: new Date("2021-01-01") },
]);
check("OWNER gana sin default", byRole?.organizationId === "org-owner");

const strictNull = resolveActiveMembership(
  [
    { organizationId: "org-a", role: "STAFF", createdAt: new Date("2020-01-01") },
    { organizationId: "org-b", role: "STAFF", createdAt: new Date("2019-01-01") },
  ],
  { strict: true },
);
check("strict multi sin default → null", strictNull === null);

check("vacío → null", resolveActiveMembership([]) === null);

console.log("\nOK session-ttl-org (TEST-004)\n");
