import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@prisma/client";
import { can, type PermissionAction } from "./permissions";
import type { PortalContext } from "@/src/server/portal";
import { isPortalEnabled } from "@/src/server/portal";

/**
 * Guards de servidor. Usar dentro de Server Actions, Route Handlers
 * y Server Components. `proxy.ts` es solo la barrera de navegación.
 */

export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para esta acción.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Sesión requerida.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session;
}

export interface OrganizationContext {
  userId: string;
  organizationId: string;
  role: Role;
}

export async function requireOrganization(): Promise<OrganizationContext> {
  const session = await requireSession();
  const { id, currentOrganizationId, role } = session.user;
  if (!currentOrganizationId || !role) {
    throw new ForbiddenError(
      "Tu usuario no pertenece a ninguna organización activa.",
    );
  }
  return { userId: id, organizationId: currentOrganizationId, role };
}

export async function requireRole(
  ...roles: Role[]
): Promise<OrganizationContext> {
  const ctx = await requireOrganization();
  if (!roles.includes(ctx.role)) {
    throw new ForbiddenError();
  }
  return ctx;
}

/**
 * Variante para Route Handlers: lanza UnauthorizedError (→401) en lugar de
 * redirigir a /login, que no tiene sentido en una respuesta JSON.
 */
export async function requireApiOrganization(): Promise<OrganizationContext> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  const { id, currentOrganizationId, role } = session.user;
  if (!currentOrganizationId || !role) {
    throw new ForbiddenError(
      "Tu usuario no pertenece a ninguna organización activa.",
    );
  }
  return { userId: id, organizationId: currentOrganizationId, role };
}

/** Verifica un permiso granular de la matriz (permissions.ts). */
export async function requirePermission(
  action: PermissionAction,
): Promise<OrganizationContext> {
  const ctx = await requireOrganization();
  if (!can(ctx.role, action)) {
    throw new ForbiddenError();
  }
  return ctx;
}

export async function requireApiPermission(
  action: PermissionAction,
): Promise<OrganizationContext> {
  const ctx = await requireApiOrganization();
  if (!can(ctx.role, action)) {
    throw new ForbiddenError();
  }
  return ctx;
}

/** Sesión del portal de clientes (audience=portal). */
export async function requirePortalSession(): Promise<PortalContext> {
  if (!isPortalEnabled()) {
    redirect("/portal/login");
  }
  const session = await auth();
  const user = session?.user;
  if (
    !user?.id ||
    user.portalAudience !== "portal" ||
    !user.clientId ||
    !user.currentOrganizationId
  ) {
    redirect("/portal/login");
  }
  return {
    accessId: user.portalAccessId ?? user.id,
    clientId: user.clientId,
    organizationId: user.currentOrganizationId,
    email: user.email ?? "",
  };
}

export async function requireApiPortalSession(): Promise<PortalContext> {
  if (!isPortalEnabled()) {
    throw new ForbiddenError("El portal de clientes está desactivado.");
  }
  const session = await auth();
  const user = session?.user;
  if (
    !user?.id ||
    user.portalAudience !== "portal" ||
    !user.clientId ||
    !user.currentOrganizationId
  ) {
    throw new UnauthorizedError();
  }
  return {
    accessId: user.portalAccessId ?? user.id,
    clientId: user.clientId,
    organizationId: user.currentOrganizationId,
    email: user.email ?? "",
  };
}
