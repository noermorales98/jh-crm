import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Next.js 16: `middleware.ts` fue renombrado a `proxy.ts`.
 * Barrera de navegación — no reemplaza la autorización del servidor
 * (requireSession/requireOrganization dentro de acciones y handlers).
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    // Todo excepto assets estáticos, imágenes optimizadas y las rutas
    // propias de Auth.js: si el proxy también las procesa, Auth.js emite
    // la cookie CSRF dos veces y los logins programáticos (curl/fetch)
    // fallan con MissingCSRF/CredentialsSignin.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
