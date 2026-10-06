import type { Metadata } from "next";
import { FondifyLayout } from "@/src/components/fondify";

export const metadata: Metadata = {
  title: "Prospección en Frío · Fondify Agency",
};

export default function AgencyProspectingPage() {
  return (
    <FondifyLayout>
      <div className="mx-auto max-w-[var(--ff-content-max)] space-y-6">
        <header className="space-y-3">
          <h1 className="ff-page-title">Prospección en Frío</h1>
          <p className="ff-page-subtitle">Busca nuevos clientes potenciales.</p>
        </header>
        <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-12 text-center shadow-[var(--ff-shadow-sm)] ring-1 ring-[var(--ff-border)]">
          <p className="text-sm text-[var(--ff-text-muted)]">
            Funcionalidad de prospección próximamente
          </p>
        </div>
      </div>
    </FondifyLayout>
  );
}
