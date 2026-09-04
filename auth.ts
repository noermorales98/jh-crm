import NextAuth from "next-auth";
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

/**
 * NextAuth v5 — Credentials contra User.passwordHash (bcryptjs).
 * La sesión JWT carga user.id, currentOrganizationId, role y sessionVersion.
 * organizationId siempre proviene de la sesión, nunca del cliente.
 * La cookie no caduca en la práctica (10 años); la expulsión real es
 * isActive=false o sessionVersion distinto (desactivar / cambiar rol).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  jwt: { maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [
    Credentials({
      name: "Credenciales",
      credentials: {
        email: { label: "Correo electrónico", type: "email" },
        password: { label: "Contraseña", type: "password" },
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
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.currentOrganizationId = user.currentOrganizationId ?? null;
        token.role = user.role ?? null;
        token.sessionVersion = user.sessionVersion;
        if (token.userId && !token.sub) token.sub = String(token.userId);
        return token;
      }

      if (!token.userId) return token;

      const state = await loadAuthTokenState(token.userId);
      const valid =
        state !== null &&
        isTokenSessionCurrent(token.sessionVersion, state.sessionVersion);

      if (!valid) {
        return {};
      }

      token.currentOrganizationId = state.currentOrganizationId;
      token.role = state.role;
      if (token.userId && !token.sub) token.sub = String(token.userId);
      return token;
    },
    session({ session, token }) {
      if (!token.userId) {
        return { ...session, user: { ...session.user, id: "", email: "" } };
      }
      session.user.id = token.userId;
      session.user.currentOrganizationId = token.currentOrganizationId ?? null;
      session.user.role = token.role ?? null;
      return session;
    },
  },
});
