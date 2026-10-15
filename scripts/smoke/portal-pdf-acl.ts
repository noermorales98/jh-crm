/**
 * TEST-001 / JH-002 — ACL portal PDF (sin DB / sin HTTP).
 *
 * Cubre: allowlist de proxy + ownership predicado.
 * HTTP E2E (200 dueño / 404 ajeno) requiere MySQL + sesión portal.
 *
 * Uso: npx tsx scripts/smoke/portal-pdf-acl.ts
 *      npm run smoke:portal-pdf-acl
 */
import { isPortalAllowedApiPath } from "../../src/server/auth/portal-api-paths";
import {
  isProgressReportOwnedByPortal,
  progressReportPortalWhere,
} from "../../src/server/progress-reports/portal-acl";
import { isAnonymousPath } from "../../src/server/auth/public-paths";

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

console.log("\n[TEST-001] portal PDF ACL");

check(
  "allow progress pdf",
  isPortalAllowedApiPath("/api/progress-reports/clxyz123/pdf") === true,
);
check(
  "allow trailing slash",
  isPortalAllowedApiPath("/api/progress-reports/clxyz123/pdf/") === true,
);
check(
  "deny progress list",
  isPortalAllowedApiPath("/api/progress-reports") === false,
);
check(
  "deny letters pdf",
  isPortalAllowedApiPath("/api/letters/abc/pdf") === false,
);
check(
  "deny client avance pdf (staff-only path)",
  isPortalAllowedApiPath("/api/clients/c1/avance/pdf") === false,
);
check(
  "deny action-plan pdf",
  isPortalAllowedApiPath("/api/clients/c1/action-plan/pdf") === false,
);
check(
  "deny files download",
  isPortalAllowedApiPath("/api/files/doc1/download") === false,
);

check(
  "progress pdf NO es anónimo",
  isAnonymousPath("/api/progress-reports/clxyz123/pdf") === false,
);

const where = progressReportPortalWhere({
  reportId: "rep1",
  organizationId: "orgA",
  clientId: "clientA",
});
check("where id", where.id === "rep1");
check("where org", where.organizationId === "orgA");
check("where case client", where.case.clientId === "clientA");
check("where case org", where.case.organizationId === "orgA");

check(
  "owner same tenant",
  isProgressReportOwnedByPortal({
    reportOrganizationId: "orgA",
    caseClientId: "clientA",
    caseOrganizationId: "orgA",
    portalClientId: "clientA",
    portalOrganizationId: "orgA",
  }),
);

check(
  "deny other client same org",
  !isProgressReportOwnedByPortal({
    reportOrganizationId: "orgA",
    caseClientId: "clientB",
    caseOrganizationId: "orgA",
    portalClientId: "clientA",
    portalOrganizationId: "orgA",
  }),
);

check(
  "deny other tenant",
  !isProgressReportOwnedByPortal({
    reportOrganizationId: "orgB",
    caseClientId: "clientA",
    caseOrganizationId: "orgB",
    portalClientId: "clientA",
    portalOrganizationId: "orgA",
  }),
);

check(
  "deny missing case link",
  !isProgressReportOwnedByPortal({
    reportOrganizationId: "orgA",
    caseClientId: null,
    caseOrganizationId: "orgA",
    portalClientId: "clientA",
    portalOrganizationId: "orgA",
  }),
);

console.log("\nOK portal-pdf-acl (TEST-001)\n");
console.log(
  "NOTE: HTTP 200/404 con sesión portal requiere MySQL sandbox (blocked si DB down).",
);
