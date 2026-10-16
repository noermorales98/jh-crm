/**
 * Pure smoke — Agency Resumen KPI labels + copy safety (no DB).
 *
 *   npm run smoke:agency-resumen-kpis
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RESUMEN_FUNDING_HINT,
  RESUMEN_FUNDING_LABEL,
  RESUMEN_KPI_DEFS,
  RESUMEN_REPAIR_LABEL,
  RESUMEN_REPORTS_LABEL,
  RESUMEN_REVIEW_LABEL,
  RESUMEN_UPDATE_CTA_HREF,
  RESUMEN_UPDATE_CTA_LABEL,
  assertResumenCopySafe,
  resumenCopyIsSafe,
} from "../../src/lib/dashboard/resumen-kpis";
import { qualifyCreditProfile } from "../../src/lib/credit/qualification";

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
  console.log("\n[agency-resumen-kpis] copy + wiring\n");

  check("4 KPI defs", RESUMEN_KPI_DEFS.length === 4);
  check(
    "keys unique",
    new Set(RESUMEN_KPI_DEFS.map((d) => d.key)).size === 4,
  );

  const allCopy = [
    RESUMEN_FUNDING_LABEL,
    RESUMEN_FUNDING_HINT,
    RESUMEN_REVIEW_LABEL,
    RESUMEN_REPAIR_LABEL,
    RESUMEN_REPORTS_LABEL,
    RESUMEN_UPDATE_CTA_LABEL,
    ...RESUMEN_KPI_DEFS.flatMap((d) => [d.label, d.hint]),
  ];
  try {
    assertResumenCopySafe(allCopy);
    check("resumen copy has no funding-approval claims", true);
  } catch (e) {
    check("resumen copy has no funding-approval claims", false, e);
  }

  check(
    "forbidden detector catches 'listos para fondeo'",
    !resumenCopyIsSafe("Clientes listos para fondeo"),
  );
  check(
    "forbidden detector catches 'aprobado'",
    !resumenCopyIsSafe("Perfil aprobado"),
  );
  check(
    "safe heuristic label passes",
    resumenCopyIsSafe(RESUMEN_FUNDING_LABEL),
  );

  check("CTA href clientes", RESUMEN_UPDATE_CTA_HREF === "/crm/clientes");

  const heuristica = qualifyCreditProfile({
    hasReport: true,
    snapshotCount: 3,
    openNegativeCount: 0,
  });
  check("qualification heuristica kind", heuristica.kind === "heuristica");
  check(
    "qualification never says listo fondeo",
    resumenCopyIsSafe(`${heuristica.label} ${heuristica.hint}`),
  );

  const root = join(__dirname, "../..");
  const dashSrc = readFileSync(
    join(root, "app/crm/dashboard/page.tsx"),
    "utf8",
  );
  check("dashboard imports RESUMEN_KPI_DEFS", dashSrc.includes("RESUMEN_KPI_DEFS"));
  check(
    "dashboard shows Actualizar reporte CTA",
    dashSrc.includes("RESUMEN_UPDATE_CTA_LABEL"),
  );
  check(
    "dashboard has Resumen operación section",
    dashSrc.includes("resumen-ops-heading"),
  );

  const serverSrc = readFileSync(
    join(root, "src/server/dashboard/index.ts"),
    "utf8",
  );
  check(
    "getDashboardSummary exposes fundingSignals",
    serverSrc.includes("fundingSignals:"),
  );
  check(
    "getDashboardSummary exposes reviewDue",
    serverSrc.includes("reviewDue:"),
  );
  check(
    "getDashboardSummary exposes inRepair",
    serverSrc.includes("inRepair:"),
  );
  check(
    "getDashboardSummary exposes recentReports",
    serverSrc.includes("recentReports:"),
  );

  console.log(`\nResultado: ${failed === 0 ? "PASS" : "FAIL"} (${failed} fallos)`);
  if (failed > 0) process.exitCode = 1;
}

main();
