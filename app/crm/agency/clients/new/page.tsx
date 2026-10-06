import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import { FondifyLayout } from "@/src/components/fondify";

export const metadata: Metadata = {
  title: "Nuevo Cliente · Fondify Agency",
};

async function createClient(formData: FormData) {
  "use server";
  const ctx = await requireOrganization();
  
  if (!can(ctx.role, "clients.create")) {
    throw new Error("No tienes permisos para crear clientes");
  }

  const firstName = formData.get("firstName") as string;
  const email = formData.get("email") as string;

  if (!firstName || !email) {
    throw new Error("Nombre y correo son requeridos");
  }

  const client = await clientService.createClient(ctx, {
    firstName,
    lastName: "",
    email,
    phone: null,
    source: "AGENCY_DIRECT",
  });

  redirect(`/crm/agency/clients/${client.id}`);
}

export default async function NewClientPage() {
  const ctx = await requireOrganization();
  
  if (!can(ctx.role, "clients.create")) {
    redirect("/crm/agency/clients");
  }

  return (
    <FondifyLayout>
      <div className="mx-auto max-w-[var(--ff-modal-width-sm)] space-y-6">
        <Link
          href="/crm/agency/clients"
          className="inline-flex items-center gap-2 text-[var(--ff-fs-sm)] text-[var(--ff-text-secondary)] transition-colors hover:text-[var(--ff-text)]"
        >
          <ArrowLeft className="size-4" strokeWidth={2} />
          Volver a Clientes
        </Link>

        <header className="space-y-2">
          <h1 className="ff-page-title">Agregar cliente</h1>
          <p className="ff-page-subtitle">Crea un nuevo cliente en tu agencia.</p>
        </header>

        <form action={createClient} className="space-y-4 rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-6 shadow-[var(--ff-shadow-sm)] ring-1 ring-[var(--ff-border)]">
          <div>
            <label htmlFor="firstName" className="mb-2 block text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text)]">
              Nombre
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              required
              className="w-full rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] bg-[var(--ff-surface)] px-3 py-2 text-[var(--ff-fs-sm)] text-[var(--ff-text)] placeholder:text-[var(--ff-text-muted)] focus:border-[var(--ff-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ff-primary)]/20"
              placeholder="Nombre del cliente"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text)]">
              Correo electrónico
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              className="w-full rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] bg-[var(--ff-surface)] px-3 py-2 text-[var(--ff-fs-sm)] text-[var(--ff-text)] placeholder:text-[var(--ff-text-muted)] focus:border-[var(--ff-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ff-primary)]/20"
              placeholder="correo@ejemplo.com"
            />
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-[var(--ff-radius-md)] bg-[var(--ff-primary)] px-4 py-2.5 text-[var(--ff-fs-sm)] font-medium text-white transition-colors hover:bg-[var(--ff-primary-hover)]"
          >
            <Plus className="size-4" strokeWidth={2} />
            Agregar
          </button>
        </form>
      </div>
    </FondifyLayout>
  );
}
