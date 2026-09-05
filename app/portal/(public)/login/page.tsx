import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppIcon } from "@/src/components/icons/app-icon";
import { Alert } from "@/src/components/ui";
import { isPortalEnabled } from "@/src/server/portal";
import { PortalLoginForm } from "./PortalLoginForm";

export const metadata: Metadata = {
  title: "Portal del cliente — J&H Multiservices",
};

export const dynamic = "force-dynamic";

export default async function PortalLoginPage() {
  const enabled = isPortalEnabled();
  const session = await auth();
  if (
    enabled &&
    session?.user?.portalAudience === "portal" &&
    session.user.clientId
  ) {
    redirect("/portal");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-app px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-surface bg-surface-elevated p-8 jh-overlay-shadow">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 w-fit">
              <AppIcon size="lg" />
            </div>
            <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">
              Portal del cliente
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              J&H Multiservices LLC
            </p>
          </div>
          {enabled ? (
            <PortalLoginForm />
          ) : (
            <Alert tone="info">
              El portal de clientes no está disponible en este momento.
            </Alert>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-text-secondary">
          Acceso solo por invitación de tu asesor.
        </p>
      </div>
    </main>
  );
}
