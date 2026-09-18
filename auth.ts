import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { prisma } from "@/src/lib/db";
import { loginSchema } from "@/src/lib/validation";
import { SESSION_MAX_AGE_SECONDS } from "@/src/server/auth/session-constants";
import {
  isTokenSessionCurrent,
  loadAuthTokenState,
} from "@/src/server/auth/session";
import { verifyMfaLogin } from "@/src/server/mfa";
import {
  authenticatePortal,
  loadPortalTokenState,
} from "@/src/server/portal";
import { clientFullName } from "@/src/server/page-helpers";

/**
 * MFA en login (T-SEC): errores con `code` propio para que el LoginForm
 * muestre el paso de código (mfa_required / mfa_invalid).
 */
class MfaRequiredError extends CredentialsSignin {
  code = "mfa_required";
}
class MfaInvalidError extends CredentialsSignin {
  code = "mfa_invalid";
}

/**
 * NextAuth v5 — dual Credentials:
 * - id "credentials": staff (User.passwordHash)
 * - id "portal": clientes (ClientPortalAccess)
 *
 * La sesión JWT carga user.id, currentOrganizationId, role/sessionVersion
 * (staff) o portalAudience/clientId (portal). organizationId siempre
 * proviene de la sesión, nunca del cliente.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  jwt: { maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [
    Credentials({
      id: "credentials",
      name: "Credenciales",
      credentials: {
        email: { label: "Correo electrónico", type: "email" },
        password: { label: "Contraseña", type: "password" },
        mfaCode: { label: "Código MFA", type: "text" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          include: {
            memberships: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { organizationId: true, role: true },
            },
          },
        });
        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) return null;

        // Enforcement MFA: con mfaEnabled la contraseña no basta.
        // verifyMfaLogin aplica lockout (5 fallos → 15 min) y recovery codes.
        if (user.mfaEnabled) {
          const mfaCode =
            typeof credentials?.mfaCode === "string"
              ? credentials.mfaCode.trim()
              : "";
          if (!mfaCode) throw new MfaRequiredError();
          const mfaOk = await verifyMfaLogin(user.id, mfaCode);
          if (!mfaOk) throw new MfaInvalidError();
        }

        const membership = user.memberships[0] ?? null;

        void prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          currentOrganizationId: membership?.organizationId ?? null,
          role: membership?.role ?? null,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
    Credentials({
      id: "portal",
      name: "Portal",
      credentials: {
        email: { label: "Correo electrónico", type: "email" },
        password: { label: "Contraseña", type: "password" },
        audience: { label: "Audiencia", type: "text" },
      },
      async authorize(credentials) {
        const audience =
          typeof credentials?.audience === "string"
            ? credentials.audience
            : "";
        if (audience !== "portal") return null;

        const parsed = loginSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
        });
        if (!parsed.success) return null;

        const access = await authenticatePortal(
          parsed.data.email,
          parsed.data.password,
        );
        if (!access) return null;

        return {
          id: access.id,
          email: access.email,
          name: clientFullName(access.client),
          currentOrganizationId: access.organizationId,
          role: null,
          sessionVersion: access.sessionVersion,
          portalAudience: "portal" as const,
          portalAccessId: access.id,
          clientId: access.clientId,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.currentOrganizationId = user.currentOrganizationId ?? null;
        token.role = user.role ?? null;
        token.sessionVersion = user.sessionVersion;
        token.name = user.name;
        if (user.portalAudience === "portal") {
          token.portalAudience = "portal";
          token.portalAccessId = user.portalAccessId ?? user.id;
          token.clientId = user.clientId ?? null;
        } else {
          delete token.portalAudience;
          delete token.portalAccessId;
          delete token.clientId;
        }
        if (token.userId && !token.sub) token.sub = String(token.userId);
        return token;
      }

      if (!token.userId) return token;

      // Portal: validar ClientPortalAccess, no User.
      if (token.portalAudience === "portal") {
        const accessId =
          (typeof token.portalAccessId === "string" && token.portalAccessId) ||
          token.userId;
        const state = await loadPortalTokenState(accessId);
        const valid =
          state !== null &&
          isTokenSessionCurrent(token.sessionVersion, state.sessionVersion);
        if (!valid) return {};
        token.currentOrganizationId = state.organizationId;
        token.clientId = state.clientId;
        token.portalAccessId = state.accessId;
        token.role = null;
        if (token.userId && !token.sub) token.sub = String(token.userId);
        return token;
      }

      const state = await loadAuthTokenState(token.userId);
      const valid =
        state !== null &&
        isTokenSessionCurrent(token.sessionVersion, state.sessionVersion);

      if (!valid) {
        return {};
      }

      token.currentOrganizationId = state.currentOrganizationId;
      token.role = state.role;
      token.name = state.name;
      if (token.userId && !token.sub) token.sub = String(token.userId);
      return token;
    },
    session({ session, token }) {
      if (!token.userId) {
        return { ...session, user: { ...session.user, id: "", email: "" } };
      }
      session.user.id = token.userId;
      session.user.name =
        typeof token.name === "string" ? token.name : (session.user.name ?? null);
      session.user.currentOrganizationId = token.currentOrganizationId ?? null;
      session.user.role = token.role ?? null;
      if (token.portalAudience === "portal") {
        session.user.portalAudience = "portal";
        session.user.portalAccessId = token.portalAccessId ?? token.userId;
        session.user.clientId = token.clientId ?? null;
      } else {
        delete session.user.portalAudience;
        delete session.user.portalAccessId;
        delete session.user.clientId;
      }
      return session;
    },
  },
});
