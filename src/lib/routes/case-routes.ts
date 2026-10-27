/**
 * Rutas del caso, centradas en el cliente (estilo Fondify: sin ids de caso).
 * Cada sección del caso vive en la ficha del cliente; solo las vistas de
 * colección (reportes) llevan ?servicio= para elegir el caso.
 * /crm/casos/:caseId/* y /servicios/:caseId/* redirigen aquí.
 */

const SECTION_RULES: [RegExp, (clientBase: string, caseId: string, match: RegExpMatchArray) => string][] = [
  [/^\/credito\/reportes\/([^/]+)$/, (b, _c, m) => `${b}/reportes/${m[1]}`],
  [/^\/credito\/importaciones\/([^/]+)$/, (b, _c, m) => `${b}/reportes/importaciones/${m[1]}`],
  [/^\/credito\/?$/, (b, c) => `${b}/reportes?servicio=${c}`],
  [/^\/comparaciones\/([^/]+)$/, (b, _c, m) => `${b}/reportes/comparaciones/${m[1]}`],
  [/^\/reportes\/([^/]+)$/, (b, _c, m) => `${b}/reportes/progreso/${m[1]}`],
  // Rondas y cartas viven en el panel Avance de la ficha del cliente.
  [/^\/rondas\/?$/, (b) => `${b}?panel=avance`],
  [/^\/rondas\/([^/]+)(\/.*)?$/, (b, _c, m) => `${b}?panel=avance&roundId=${encodeURIComponent(m[1])}`],
  [/^\/documentos\/?$/, (b) => `${b}/expediente`],
  [/^\/tareas\/?$/, (b) => `${b}/tareas`],
  [/^\/pagos\/?$/, (b) => `${b}/pagos`],
];

/** `sub` empieza con "/" (p. ej. "/credito") o vacío. */
export function caseHref(clientId: string, caseId: string, sub = ""): string {
  const base = `/crm/clientes/${clientId}`;
  const [path, query] = sub.split("?");
  if (path === "/cotizaciones") return `/crm/cotizaciones?clientId=${clientId}`;
  for (const [pattern, build] of SECTION_RULES) {
    const match = path.match(pattern);
    if (match) {
      const href = build(base, caseId, match);
      return query ? `${href}${href.includes("?") ? "&" : "?"}${query}` : href;
    }
  }
  // Ficha del servicio (resumen del caso).
  return `${base}/servicios/${caseId}${sub}`;
}

/** Enlace cuando solo se conoce el caso: redirige a la ruta del cliente. */
export function legacyCaseHref(caseId: string, sub = ""): string {
  return `/crm/casos/${caseId}${sub}`;
}

/** Análisis de Crédito y Plan de Acción de un reporte. */
export function creditAnalysisHref(reportId: string): string {
  return `/crm/reportes/${reportId}`;
}

/** Patrón de ruta para revalidatePath(…, "layout"): toda la ficha del cliente. */
export const CASE_ROUTE_PATTERN = "/crm/clientes/[clientId]";
