/**
 * Elección del reporte de la ficha.
 *
 *   npm run smoke:credit-report-selection
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  NEWER_INCOMPLETE_IMPORT_NOTE,
  selectActionPlanReport,
  type ActionPlanReportCandidate,
} from "../../src/lib/credit/report-selection";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function report(
  partial: Partial<ActionPlanReportCandidate> & Pick<ActionPlanReportCandidate, "id">,
): ActionPlanReportCandidate {
  return {
    reportDate: "2026-01-01",
    importedAt: "2026-01-01T00:00:00.000Z",
    hasSnapshot: false,
    hasItem: false,
    usable: false,
    ...partial,
  };
}

function main() {
  console.log("\n[credit-report-selection]");
  const skipped = selectActionPlanReport([
    report({
      id: "new-empty",
      reportDate: "2026-10-01",
      hasSnapshot: true,
      hasItem: true,
      usable: false,
    }),
    report({
      id: "older-accounts",
      reportDate: "2026-08-01",
      hasSnapshot: true,
      hasItem: true,
      usable: true,
    }),
  ]);
  check(
    "un import reciente sin cuentas no tapa el reporte útil",
    skipped.reportId === "older-accounts" && skipped.newerIncomplete,
  );

  const latest = selectActionPlanReport([
    report({ id: "new-usable", reportDate: "2026-10-01", usable: true, hasItem: true }),
    report({ id: "older-usable", reportDate: "2026-08-01", usable: true, hasItem: true }),
  ]);
  check(
    "el más nuevo con cuentas sigue ganando",
    latest.reportId === "new-usable" && !latest.newerIncomplete,
  );

  const snapshots = selectActionPlanReport([
    report({ id: "shell", reportDate: "2026-10-01" }),
    report({ id: "scores", reportDate: "2026-09-01", hasSnapshot: true }),
  ]);
  check(
    "sin cuentas útiles se conserva el snapshot",
    snapshots.reportId === "scores" && !snapshots.newerIncomplete,
  );

  const view = readFileSync("src/components/clients/client-action-plan-view.tsx", "utf8");
  const chooser = readFileSync("src/server/credit-reports/action-plan.ts", "utf8");
  check(
    "la ficha avisa y un reportId explícito no pasa por la elección",
    view.includes("NEWER_INCOMPLETE_IMPORT_NOTE") &&
      view.includes(NEWER_INCOMPLETE_IMPORT_NOTE) === false &&
      chooser.includes("selectActionPlanReport") &&
      chooser.includes("if (!resolvedReportId)"),
  );
  check(
    "la nota no inventa un monto",
    !NEWER_INCOMPLETE_IMPORT_NOTE.includes("$") && !NEWER_INCOMPLETE_IMPORT_NOTE.includes("USD"),
  );

  console.log("\nOK credit-report-selection\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
