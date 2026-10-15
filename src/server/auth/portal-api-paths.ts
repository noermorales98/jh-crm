/**
 * JH-002 / TEST-001 — APIs que una sesión portal puede alcanzar vía proxy.
 *
 * El resto de `/api/*` sigue siendo solo staff. La autorización fina
 * (dueño del reporte / mismo tenant) vive en el route handler.
 */

/** GET PDF de progreso: `/api/progress-reports/:id/pdf` */
const PROGRESS_REPORT_PDF =
  /^\/api\/progress-reports\/[^/]+\/pdf\/?$/i;

/**
 * true si el pathname es una API permitida para audience=portal.
 * No implica autorización de negocio: solo deja pasar el proxy.
 */
export function isPortalAllowedApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  return PROGRESS_REPORT_PDF.test(pathname);
}
