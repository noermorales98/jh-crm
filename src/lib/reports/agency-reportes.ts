/**
 * Agency Reportes — aggregated credit + progress reports across the org.
 */

export const REPORTES_PAGE_TITLE = "Reportes";
export const REPORTES_PAGE_DESCRIPTION =
  "Reportes de crédito y de progreso de toda la organización.";
export const REPORTES_NAV_LABEL = "Reportes";
export const REPORTES_NAV_DESCRIPTION =
  "Crédito y progreso agregados por organización.";
export const REPORTES_HREF = "/crm/reportes";

export const REPORTES_KIND_ALL = "all";
export const REPORTES_KIND_CREDIT = "credit";
export const REPORTES_KIND_PROGRESS = "progress";

export type ReportesKind =
  | typeof REPORTES_KIND_ALL
  | typeof REPORTES_KIND_CREDIT
  | typeof REPORTES_KIND_PROGRESS;

export const REPORTES_KIND_LABELS: Record<ReportesKind, string> = {
  all: "Todos",
  credit: "Crédito",
  progress: "Progreso",
};

export const REPORTES_LIMIT = 40;

export function parseReportesKind(raw: string | null | undefined): ReportesKind {
  if (raw === REPORTES_KIND_CREDIT || raw === REPORTES_KIND_PROGRESS) return raw;
  return REPORTES_KIND_ALL;
}
