const DEFAULT_AFTER_LOGIN = "/crm/dashboard";

/**
 * Adónde volver tras iniciar sesión. Solo rutas del mismo origen: el CRM (`/crm…`) y la
 * pantalla de consentimiento del conector de Claude (`/oauth/authorize`). Cualquier otra
 * cosa (otro dominio, `//host`, barras invertidas, esquemas raros) vuelve al panel.
 */
export function safeLoginRedirect(raw: string | null, origin: string): string {
  if (!raw) return DEFAULT_AFTER_LOGIN;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== origin) return DEFAULT_AFTER_LOGIN;
  if (url.pathname.startsWith("/crm") || url.pathname === "/oauth/authorize") {
    return `${url.pathname}${url.search}`;
  }
  return DEFAULT_AFTER_LOGIN;
}
