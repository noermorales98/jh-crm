/**
 * Pure smoke — Agency Reportes (aggregated credit + progress).
 *
 *   npm run smoke:agency-reportes
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPORTES_HREF,
  REPORTES_KIND_CREDIT,
  REPORTES_KIND_PROGRESS,
  REPORTES_NAV_LABEL,
  REPORTES_PAGE_TITLE,
  parseReportesKind,
} from "../../src/lib/reports/agency-reportes";
import { RESUMEN_KPI_DEFS } from "../../src/lib/dashboard/resumen-kpis";

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
  console.log("\n[agency-reportes] copy + wiring\n");

  check("title Reportes", REPORTES_PAGE_TITLE === "Reportes");
  check("href /crm/reportes", REPORTES_HREF === "/crm/reportes");
  check("nav label Reportes", REPORTES_NAV_LABEL === "Reportes");
  check("parse empty → all", parseReportesKind(undefined) === "all");
  check("parse credit", parseReportesKind(REPORTES_KIND_CREDIT) === "credit");
  check(
    "parse progress",
    parseReportesKind(REPORTES_KIND_PROGRESS) === "progress",
  );

  const recent = RESUMEN_KPI_DEFS.find((d) => d.key === "recentReports");
  check(
    "Resumen KPI recentReports → /crm/reportes",
    recent?.href === REPORTES_HREF,
  );

  const root = join(__dirname, "../..");
  const pageSrc = readFileSync(join(root, "app/crm/reportes/page.tsx"), "utf8");
  check("page imports listAgencyReports", pageSrc.includes("listAgencyReports"));
  check("page uses FilterSelect kind", pageSrc.includes('name="kind"'));

  const serverSrc = readFileSync(
    join(root, "src/server/agency-reports/index.ts"),
    "utf8",
  );
  check(
    "server queries creditReport",
    serverSrc.includes("prisma.creditReport.findMany"),
  );
  check(
    "server queries clientProgressReport",
    serverSrc.includes("prisma.clientProgressReport.findMany"),
  );

  const moreSrc = readFileSync(
    join(root, "src/components/layout/more-nav-panel.tsx"),
    "utf8",
  );
  check("Más nav imports REPORTES_HREF", moreSrc.includes("REPORTES_HREF"));

  if (failed > 0) {
    console.error(`\n[agency-reportes] ${failed} check(s) failed\n`);
    process.exit(1);
  }
  console.log("\n[agency-reportes] ok\n");
}

main();
