import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppIcon } from "@/src/components/icons/app-icon";
import { IntakeForm } from "@/src/components/intake/intake-form";
import { isIntakeEnabled } from "@/src/server/intake";

export const metadata: Metadata = {
  title: "Carga de información — J&H Multiservices",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!isIntakeEnabled()) notFound();

  const { token } = await params;
  if (!token || token.length < 20) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-app px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="rounded-surface bg-surface-elevated p-8 jh-overlay-shadow">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 w-fit">
              <AppIcon size="lg" />
            </div>
            <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">
              Información del cliente
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Completa tus datos y documentos de forma segura.
            </p>
          </div>
          <IntakeForm token={token} />
        </div>
        <p className="mt-6 text-center text-sm text-text-secondary">
          Este enlace es personal y puede expirar.
        </p>
      </div>
    </main>
  );
}
