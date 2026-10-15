import { cache } from "react";
import { prisma } from "@/src/lib/db";
import type { Role } from "@prisma/client";
import { resolveActiveMembership } from "@/src/server/auth/resolve-active-membership";

export type AuthTokenState = {
  userId: string;
  name: string | null;
  currentOrganizationId: string | null;
  role: Role | null;
  sessionVersion: number;
};

/**
 * Estado actual del usuario para el JWT. null = sesión inválida
 * (inexistente, inactivo o sin derecho a permanecer autenticado).
 * cache() evita hits repetidos a sessionVersion en el mismo request.
 *
 * Org activa: `resolveActiveMembership` (JH-005), no “primera fila” a ciegas
 * cuando hay varias membresías.
 */
export const loadAuthTokenState = cache(
  async (userId: string): Promise<AuthTokenState | null> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        isActive: true,
        sessionVersion: true,
        memberships: {
          orderBy: { createdAt: "asc" },
          select: { organizationId: true, role: true, createdAt: true },
        },
      },
    });
    if (!user || !user.isActive) return null;
    const membership = resolveActiveMembership(user.memberships);
    return {
      userId,
      name: user.name,
      currentOrganizationId: membership?.organizationId ?? null,
      role: membership?.role ?? null,
      sessionVersion: user.sessionVersion,
    };
  },
);

export function isTokenSessionCurrent(
  tokenSessionVersion: unknown,
  dbSessionVersion: number,
): boolean {
  return (
    typeof tokenSessionVersion === "number" &&
    tokenSessionVersion === dbSessionVersion
  );
}
