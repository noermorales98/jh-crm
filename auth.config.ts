import type { NextAuthConfig } from "next-auth";

const PUBLIC_INTAKE_ENABLED = process.env.FEATURE_PUBLIC_INTAKE === "true";

/**
 * Config compartida de NextAuth usada por proxy.ts (borde de navegación)
 * y por auth.ts (Node, con Prisma). No importar Prisma aquí.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // Self-hosted (`next start`): Auth.js exige confiar explícitamente en el
  // host; sin esto, cualquier login fuera de `next dev` falla con
  // UntrustedHost. Seguro aquí: CRM interno con NEXT_PUBLIC_APP_URL fija.
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      // Siempre públicos: auth, endpoints públicos, cron, health y assets.
      if (
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/public") ||
        pathname.startsWith("/api/cron") ||
        pathname.startsWith("/api/mails") ||
        pathname === "/api/health" ||
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico" ||
        /\.(?:svg|png|jpe?g|gif|webp|ico)$/i.test(pathname)
      ) {
        return true;
      }

      if (pathname === "/" || pathname === "/login" || pathname.startsWith("/login/")) {
        return true;
      }

      if (PUBLIC_INTAKE_ENABLED && pathname.startsWith("/intake")) {
        return true;
      }

      // Todo lo demás requiere sesión. `false` redirige a pages.signIn.
      return Boolean(auth?.user);
    },
  },
  providers: [], // se completan en auth.ts
} satisfies NextAuthConfig;
