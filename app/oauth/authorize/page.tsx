import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/src/lib/db";
import { AppIcon } from "@/src/components/icons/app-icon";
import { Alert } from "@/src/components/ui/alert";
import { buttonClasses } from "@/src/components/ui/button";
import { approveMcpAuthorization, denyMcpAuthorization } from "@/src/actions/mcp-oauth";
import { requireOrganization, type OrganizationContext } from "@/src/server/auth/guards";
import { parseAuthorizeParams } from "@/src/server/mcp/oauth/authorize";
import {
  OAuthError,
  isMcpConnectorFeatureOn,
  validateAuthorizeRequest,
} from "@/src/server/mcp/oauth/service";
import type { SearchParams } from "@/src/server/page-helpers";

export const metadata: Metadata = {
  title: "Conectar Claude — J&H CRM",
};

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  SPECIALIST: "Especialista",
  STAFF: "Staff",
  VIEWER: "Solo lectura",
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-app px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-surface bg-surface-elevated p-6 sm:p-8 jh-overlay-shadow">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 w-fit">
              <AppIcon size="lg" />
            </div>
            <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">
              Conectar Claude con J&H CRM
            </h1>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

function Problem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Shell>
      <Alert tone="error">
        <p className="font-medium">{title}</p>
        <p className="mt-1">{children}</p>
      </Alert>
      <Link href="/crm/dashboard" className={`${buttonClasses("secondary", "md")} mt-6 w-full`}>
        Ir al CRM
      </Link>
    </Shell>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  if (!isMcpConnectorFeatureOn()) notFound();

  let ctx: OrganizationContext;
  try {
    ctx = await requireOrganization();
  } catch {
    return (
      <Problem title="Esta cuenta no puede conectar Claude">
        Solo el equipo de la agencia puede conectar Claude. Entra con tu usuario del CRM.
      </Problem>
    );
  }

  const params = await searchParams;
  const parsed = parseAuthorizeParams(params);
  if (!parsed.ok) {
    return (
      <Problem title="La solicitud de conexión no es válida">
        Vuelve a Claude y pulsa «Conectar» otra vez.
      </Problem>
    );
  }

  let clientName: string;
  try {
    ({ clientName } = await validateAuthorizeRequest(parsed.value.req));
  } catch (error) {
    if (!(error instanceof OAuthError)) throw error;
    return (
      <Problem title="La solicitud de conexión no es válida">
        Vuelve a Claude y pulsa «Conectar» otra vez.
      </Problem>
    );
  }

  const [user, organization] = await Promise.all([
    prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, email: true } }),
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true, settings: { select: { mcpEnabled: true } } },
    }),
  ]);

  if (!organization?.settings?.mcpEnabled) {
    const canEnable = ctx.role === "OWNER" || ctx.role === "ADMIN";
    return (
      <Shell>
        <Alert tone="info">
          <p className="font-medium">El conector de Claude está apagado</p>
          <p className="mt-1">
            {canEnable
              ? "Enciéndelo en Configuración → Claude y vuelve a pulsar «Conectar» en Claude."
              : "Pide a un administrador que lo encienda en Configuración → Claude."}
          </p>
        </Alert>
        <Link href="/crm/dashboard" className={`${buttonClasses("secondary", "md")} mt-6 w-full`}>
          Ir al CRM
        </Link>
      </Shell>
    );
  }

  const hidden = Object.entries(params).flatMap(([key, value]) =>
    typeof value === "string" ? [{ key, value }] : [],
  );
  const role = ROLE_LABELS[ctx.role] ?? ctx.role;

  return (
    <Shell>
      <p className="text-center text-sm text-text-secondary">
        <span className="font-medium text-ink">{clientName}</span> quiere acceder a{" "}
        <span className="font-medium text-ink">{organization.name}</span> con tu usuario.
      </p>

      <dl className="mt-6 space-y-2 rounded-control bg-surface-panel p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">Usuario</dt>
          <dd className="truncate text-ink">{user?.name ?? user?.email}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">Rol</dt>
          <dd className="text-ink">{role}</dd>
        </div>
      </dl>

      <ul className="mt-6 list-disc space-y-1.5 pl-5 text-sm text-text-secondary">
        <li>Claude podrá leer, crear, editar y borrar lo mismo que tu rol en el CRM.</li>
        <li>Antes de borrar algo, Claude te pedirá confirmación.</li>
        <li>Nunca verá SSN/ITIN ni números de cuenta completos.</li>
        <li>Todo lo que haga quedará en la auditoría como hecho vía Claude.</li>
        <li>Puedes cortar el acceso cuando quieras en Configuración → Claude.</li>
      </ul>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row">
        <form action={denyMcpAuthorization} className="sm:flex-1">
          {hidden.map(({ key, value }) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <button type="submit" className={`${buttonClasses("secondary", "md")} w-full`}>
            Cancelar
          </button>
        </form>
        <form action={approveMcpAuthorization} className="sm:flex-1">
          {hidden.map(({ key, value }) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <button type="submit" className={`${buttonClasses("primary", "md")} w-full`}>
            Permitir
          </button>
        </form>
      </div>
    </Shell>
  );
}
