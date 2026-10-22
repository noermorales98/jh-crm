/**
 * Elección del reporte que alimenta la ficha.
 * Una cuenta útil tiene tipo o límite. Un import más nuevo sin eso no la tapa.
 */

export const REPORT_SELECTION_VERSION = "report-selection-2026-10-22";

export const NEWER_INCOMPLETE_IMPORT_NOTE =
  "Hay un import más reciente incompleto. Esta ficha usa el reporte que sí tiene cuentas.";

export type ActionPlanReportCandidate = {
  id: string;
  reportDate: string;
  importedAt: string;
  hasSnapshot: boolean;
  hasItem: boolean;
  usable: boolean;
};

export type ActionPlanReportChoice = {
  reportId: string | null;
  newerIncomplete: boolean;
};

function newerThan(
  candidate: ActionPlanReportCandidate,
  chosen: ActionPlanReportCandidate,
): boolean {
  if (candidate.reportDate !== chosen.reportDate) {
    return candidate.reportDate > chosen.reportDate;
  }
  if (candidate.importedAt !== chosen.importedAt) {
    return candidate.importedAt > chosen.importedAt;
  }
  return candidate.id > chosen.id;
}

export function selectActionPlanReport(
  reports: readonly ActionPlanReportCandidate[],
): ActionPlanReportChoice {
  const ordered = [...reports].sort((left, right) =>
    newerThan(left, right) ? -1 : newerThan(right, left) ? 1 : 0,
  );
  const usable = ordered.find((report) => report.usable);
  if (usable) {
    return {
      reportId: usable.id,
      newerIncomplete: ordered.some((report) => newerThan(report, usable)),
    };
  }
  const withData = ordered.find((report) => report.hasSnapshot || report.hasItem);
  if (withData) return { reportId: withData.id, newerIncomplete: false };
  return { reportId: ordered[0]?.id ?? null, newerIncomplete: false };
}
