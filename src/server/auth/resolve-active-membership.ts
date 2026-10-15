import type { Role } from "@prisma/client";

export type MembershipSlice = {
  organizationId: string;
  role: Role;
  createdAt?: Date;
};

const ROLE_RANK: Record<Role, number> = {
  OWNER: 0,
  ADMIN: 1,
  SPECIALIST: 2,
  STAFF: 3,
  VIEWER: 4,
};

/**
 * Elige la membresía activa sin ambigüedad silenciosa.
 *
 * Orden (JH-005):
 * 1. `AUTH_DEFAULT_ORGANIZATION_ID` si el usuario es miembro de esa org
 * 2. Única membresía
 * 3. Mejor rol (OWNER→VIEWER), desempate por `createdAt` asc, luego orgId
 *
 * Si hay varias y no hay default, la elección es **determinista** (no aleatoria).
 * Con `AUTH_ORG_STRICT=true` y >1 membresía sin default → null (login sin org).
 */
export function resolveActiveMembership(
  memberships: MembershipSlice[],
  options?: {
    defaultOrganizationId?: string | null;
    strict?: boolean;
  },
): MembershipSlice | null {
  if (memberships.length === 0) return null;

  const defaultOrgId =
    options?.defaultOrganizationId ??
    process.env.AUTH_DEFAULT_ORGANIZATION_ID ??
    null;
  const strict =
    options?.strict ??
    (process.env.AUTH_ORG_STRICT === "1" ||
      process.env.AUTH_ORG_STRICT === "true");

  if (defaultOrgId) {
    const preferred = memberships.find((m) => m.organizationId === defaultOrgId);
    if (preferred) return preferred;
  }

  if (memberships.length === 1) return memberships[0] ?? null;

  if (strict) return null;

  const sorted = [...memberships].sort((a, b) => {
    const rankDiff = (ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99);
    if (rankDiff !== 0) return rankDiff;
    const aTime = a.createdAt?.getTime() ?? 0;
    const bTime = b.createdAt?.getTime() ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.organizationId.localeCompare(b.organizationId);
  });

  return sorted[0] ?? null;
}
