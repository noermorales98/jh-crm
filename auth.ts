import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { prisma } from "@/src/lib/db";
import { loginSchema } from "@/src/lib/validation";

/**
 * NextAuth v5 — Credentials contra User.passwordHash (bcryptjs).
 * La sesión JWT carga user.id, currentOrganizationId y role
 * (de OrganizationMember). Invariante: organizationId siempre
 * proviene de la sesión, nunca del cliente.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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

        // Actualizar lastLoginAt sin bloquear la respuesta.
        void prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          currentOrganizationId: membership?.organizationId ?? null,
          role: membership?.role ?? null,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.currentOrganizationId = user.currentOrganizationId ?? null;
        token.role = user.role ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
        session.user.currentOrganizationId = token.currentOrganizationId ?? null;
        session.user.role = token.role ?? null;
      }
      return session;
    },
  },
});
