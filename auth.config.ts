import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";
import { SESSION_MAX_AGE_SECONDS } from "@/src/server/auth/session-constants";

/**
 * Config compartida de NextAuth usada por proxy.ts (borde de navegación)
 * y por auth.ts (Node, con Prisma). No importar Prisma aquí.
 *
 * session.maxAge largo: la sesión no caduca sola; auth.ts invalida JWT
 * cuando isActive=false o sessionVersion cambia.
 *
 * El proxy solo tiene este config: mapear token.userId → session.user.id
 * aquí (sin Prisma). authorized() no debe exigir id si el user existe pero
 * el mapeo aún no corrió; solo rechaza id vacío tras invalidar el JWT.
 */
function isPortalFeatureOn() {
  return process.env.FEATURE_CLIENT_PORTAL === "true";
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // Self-hosted (`next start`): Auth.js exige confiar explícitamente en el
  // host; sin esto, cualquier login fuera de `next dev` falla con
  // UntrustedHost. Seguro aquí: CRM interno con NEXT_PUBLIC_APP_URL fija.
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  jwt: { maxAge: SESSION_MAX_AGE_SECONDS },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.currentOrganizationId = user.currentOrganizationId ?? null;
        token.role = user.role ?? null;
        token.sessionVersion = user.sessionVersion;
        if (user.portalAudience === "portal") {
          token.portalAudience = "portal";
          token.portalAccessId = user.portalAccessId ?? user.id;
          token.clientId = user.clientId ?? null;
        }
      }
      if (token.userId && !token.sub) {
        token.sub = String(token.userId);
      }
      return token;
    },
    session({ session, token }) {
      const id =
        (typeof token.userId === "string" && token.userId) ||
        (typeof token.sub === "string" && token.sub) ||
        "";
      session.user.id = id;
      session.user.currentOrganizationId =
        (token.currentOrganizationId as string | null | undefined) ?? null;
      session.user.role = (token.role as typeof session.user.role) ?? null;
      if (token.portalAudience === "portal") {
        session.user.portalAudience = "portal";
        session.user.portalAccessId =
          (token.portalAccessId as string | undefined) ?? id;
        session.user.clientId =
          (token.clientId as string | null | undefined) ?? null;
      }
      return session;
    },
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

      // Intake: la ruta es pública; la página/APIs responden 404 si el flag está off.
      if (pathname.startsWith("/intake")) {
        return true;
      }

      if (pathname === "/" || pathname === "/login" || pathname.startsWith("/login/")) {
        return true;
      }

      // Páginas legales públicas (SPRINT 8).
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

      // Portal de clientes (feature flag + audiencia distinta del staff).
      if (pathname === "/portal/login" || pathname.startsWith("/portal/login/")) {
        return true;
      }
      if (pathname.startsWith("/portal") || pathname.startsWith("/api/portal")) {
        if (!isPortalFeatureOn()) {
          return NextResponse.redirect(new URL("/portal/login", request.nextUrl));
        }
        const portalOk =
          auth?.user?.portalAudience === "portal" &&
          typeof auth.user.clientId === "string" &&
          auth.user.clientId.length > 0 &&
          !(typeof auth.user.id === "string" && auth.user.id.length === 0);
        if (!portalOk) {
          return NextResponse.redirect(new URL("/portal/login", request.nextUrl));
        }
        return true;
      }

      // CRM y APIs internas: solo staff (rol presente). Rechazar sesiones portal.
      if (
        pathname.startsWith("/crm") ||
        pathname.startsWith("/api/files") ||
        pathname.startsWith("/api/")
      ) {
        if (!auth?.user) return false;
        if (typeof auth.user.id === "string" && auth.user.id.length === 0) {
          return false;
        }
        if (auth.user.portalAudience === "portal" || !auth.user.role) {
          return NextResponse.redirect(new URL("/portal", request.nextUrl));
        }
        return true;
      }

      // Todo lo demás requiere sesión. `false` redirige a pages.signIn.
      // El proxy a veces expone `user` sin `id`. Solo rechazar si no hay user,
      // o si id está explícitamente vacío tras invalidar el JWT.
      if (!auth?.user) return false;
      if (typeof auth.user.id === "string" && auth.user.id.length === 0) {
        return false;
      }
      return true;
    },
  },
  providers: [], // se completan en auth.ts
} satisfies NextAuthConfig;
