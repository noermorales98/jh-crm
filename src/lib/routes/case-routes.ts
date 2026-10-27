/**
 * Rutas del caso, centradas en el cliente.
 * El caso vive en /crm/clientes/:clientId/servicios/:caseId/*.
 * /crm/casos/:caseId/* sigue funcionando como redirección (sin clientId a mano).
 */

/** `sub` empieza con "/" (p. ej. "/credito") o vacío. */
export function caseHref(clientId: string, caseId: string, sub = ""): string {
  return `/crm/clientes/${clientId}/servicios/${caseId}${sub}`;
}

/** Enlace cuando solo se conoce el caso: redirige a la ruta del cliente. */
export function legacyCaseHref(caseId: string, sub = ""): string {
  return `/crm/casos/${caseId}${sub}`;
}

/** Análisis de Crédito y Plan de Acción de un reporte. */
export function creditAnalysisHref(reportId: string): string {
  return `/crm/reportes/${reportId}`;
}

/** Patrón de ruta para revalidatePath(…, "layout"). */
export const CASE_ROUTE_PATTERN = "/crm/clientes/[clientId]/servicios/[caseId]";
