/**
 * Rutas que el proxy (authConfig.authorized) deja pasar sin sesión.
 * Mantener pura: sin Prisma ni process.env (salvo lo que ya no aplica aquí).
 *
 * El portal autenticado (/portal, /api/portal) NO es anónimo: tiene su propia
 * rama en authorized(). /portal/login sí es anónimo.
 */
export function isAnonymousPath(pathname: string): boolean {
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/mails") ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/webhooks/stripe/") ||
    pathname === "/api/webhooks/stripe" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpe?g|gif|webp|ico)$/i.test(pathname)
  ) {
    return true;
  }

  // Intake: la página/APIs responden 404 si el flag está off.
  if (pathname.startsWith("/intake")) {
    return true;
  }

  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/login/")
  ) {
    return true;
  }

  if (
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/cancellation" ||
    pathname === "/refunds" ||
    pathname === "/disclosures" ||
    pathname === "/sms-terms"
  ) {
    return true;
  }

  if (
    pathname === "/portal/login" ||
    pathname.startsWith("/portal/login/")
  ) {
    return true;
  }

  // Retorno de Stripe Checkout (sin sesión de staff).
  if (pathname === "/pay/success" || pathname === "/pay/cancel") {
    return true;
  }

  // Avance compartido: la página valida HMAC/caducidad.
  if (pathname.startsWith("/a/")) {
    return true;
  }

  return false;
}
