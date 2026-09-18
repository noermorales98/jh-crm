import { prisma } from "@/src/lib/db";
import type { Role } from "@prisma/client";

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
 */
export async function loadAuthTokenState(
  userId: string,
): Promise<AuthTokenState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      isActive: true,
      sessionVersion: true,
      memberships: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { organizationId: true, role: true },
      },
    },
  });
  if (!user || !user.isActive) return null;
  const membership = user.memberships[0] ?? null;
  return {
    userId,
    name: user.name,
    currentOrganizationId: membership?.organizationId ?? null,
    role: membership?.role ?? null,
    sessionVersion: user.sessionVersion,
  };
}

export function isTokenSessionCurrent(
  tokenSessionVersion: unknown,
  dbSessionVersion: number,
): boolean {
  return (
    typeof tokenSessionVersion === "number" &&
    tokenSessionVersion === dbSessionVersion
  );
}
