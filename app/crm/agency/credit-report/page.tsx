import type { Metadata } from "next";
import { FondifyLayout } from "@/src/components/fondify";

export const metadata: Metadata = {
  title: "Mi Reporte de Crédito · Fondify Agency",
};

export default function AgencyCreditReportPage() {
  return (
    <FondifyLayout>
      <div className="mx-auto max-w-[var(--ff-content-max)] space-y-6">
        <header className="space-y-3">
          <h1 className="ff-page-title">Mi Reporte de Crédito</h1>
          <p className="ff-page-subtitle">Tu propio reporte de crédito personal.</p>
        </header>
        <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-12 text-center shadow-[var(--ff-shadow-sm)] ring-1 ring-[var(--ff-border)]">
          <p className="text-sm text-[var(--ff-text-muted)]">
            Activa tu reporte de crédito personal para comenzar
          </p>
        </div>
      </div>
    </FondifyLayout>
  );
}
