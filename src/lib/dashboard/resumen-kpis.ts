/**
 * Agency Resumen KPI copy + pure helpers (Fondify-eq capability, JH wording).
 * Never claims funding approval / "listo para fondeo" as eligibility.
 */

export const RESUMEN_FUNDING_LABEL = "Señales fondeo";
export const RESUMEN_FUNDING_HINT =
  "Heurística interna (reporte sin negativos abiertos). No es elegibilidad ni oferta.";

export const RESUMEN_REVIEW_LABEL = "Listos revisión";
export const RESUMEN_REVIEW_HINT = "Rondas con revisión próxima o vencida";

export const RESUMEN_REPAIR_LABEL = "En reparación";
export const RESUMEN_REPAIR_HINT = "Clientes ACTIVE / PAUSED";

export const RESUMEN_REPORTS_LABEL = "Reportes recientes";
export const RESUMEN_REPORTS_HINT = "Últimos 30 días";

export const RESUMEN_UPDATE_CTA_LABEL = "Actualizar reporte";
export const RESUMEN_UPDATE_CTA_HREF = "/crm/clientes";
export const RESUMEN_UPDATE_CTA_HINT =
  "Abre un cliente y sube / analiza el PDF del buró desde su ficha.";

export type ResumenKpiKey =
  | "fundingSignals"
  | "reviewDue"
  | "inRepair"
  | "recentReports";

export type ResumenKpiDef = {
  key: ResumenKpiKey;
  label: string;
  hint: string;
  href: string;
};

export const RESUMEN_KPI_DEFS: ResumenKpiDef[] = [
  {
    key: "fundingSignals",
    label: RESUMEN_FUNDING_LABEL,
    hint: RESUMEN_FUNDING_HINT,
    href: "/crm/clientes?status=repair",
  },
  {
    key: "reviewDue",
    label: RESUMEN_REVIEW_LABEL,
    hint: RESUMEN_REVIEW_HINT,
    href: "/crm/rondas",
  },
  {
    key: "inRepair",
    label: RESUMEN_REPAIR_LABEL,
    hint: RESUMEN_REPAIR_HINT,
    href: "/crm/clientes?status=repair",
  },
  {
    key: "recentReports",
    label: RESUMEN_REPORTS_LABEL,
    hint: RESUMEN_REPORTS_HINT,
    href: "/crm/clientes",
  },
];

/**
 * Forbid Fondify-style approval copy in Resumen strings.
 * Allows disclaimers like "no es elegibilidad / no es oferta".
 */
const FORBIDDEN_APPROVAL =
  /\b(listo(?:s)?\s+para\s+fondeo|aprobad[oa]s?|oferta\s+de\s+fondeo|es\s+elegible|clientes\s+elegibles)\b/i;

export function resumenCopyIsSafe(text: string): boolean {
  return !FORBIDDEN_APPROVAL.test(text);
}

export function assertResumenCopySafe(texts: string[]): void {
  for (const t of texts) {
    if (!resumenCopyIsSafe(t)) {
      throw new Error(`Resumen copy claims funding approval: ${t}`);
    }
  }
}
