import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppIcon } from "@/src/components/icons/app-icon";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Iniciar sesión — J&H CRM",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/crm/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-app px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-surface border border-border-subtle bg-surface-elevated p-8">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 w-fit">
              <AppIcon size="lg" />
            </div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              J&H CRM
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              J&H Multiservices LLC — Acceso interno
            </p>
          </div>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-text-secondary">
          Sistema interno. El acceso es solo por invitación.
        </p>
      </div>
    </main>
  );
}
