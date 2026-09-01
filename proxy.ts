import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";
import { authConfig } from "./auth.config";

const authMiddleware = NextAuth(authConfig).auth as unknown as NextMiddleware;

/**
 * Next.js 16: `middleware.ts` fue renombrado a `proxy.ts`.
 * Barrera de navegación — no reemplaza la autorización del servidor
 * (requireSession/requireOrganization dentro de acciones y handlers).
 *
 * Las Server Actions (POST + header `next-action`) no pasan por NextAuth:
 * su wrapper reconstruye `NextResponse.next()` como un `Response` genérico
 * y en producción Next.js deja de resolver el ID de la acción
 * (`Failed to find Server Action`). La auth de esas acciones vive en el
 * servidor (guards), no en este proxy.
 */
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.method === "POST" && request.headers.has("next-action")) {
    return NextResponse.next();
  }
  return authMiddleware(request, event);
}

export const config = {
  matcher: [
    // Todo excepto assets estáticos, imágenes optimizadas y las rutas
    // propias de Auth.js: si el proxy también las procesa, Auth.js emite
    // la cookie CSRF dos veces y los logins programáticos (curl/fetch)
    // fallan con MissingCSRF/CredentialsSignin.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
