import type { Metadata } from "next";
import Link from "next/link";
import { Search, FileText } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { FondifyLayout } from "@/src/components/fondify";

export const metadata: Metadata = {
  title: "Reportes · Fondify Agency",
};

export default async function AgencyReportsPage() {
  const ctx = await requireOrganization();

  // Mock data for now - will be replaced with real data
  const reports = [
    {
      id: "1",
      clientName: "María García",
      clientEmail: "maria@example.com",
      fileName: "credit_report_20241006.pdf",
      date: "2024-10-06",
    },
    {
      id: "2",
      clientName: "Juan Pérez",
      clientEmail: "juan@example.com",
      fileName: "credit_report_20241005.pdf",
      date: "2024-10-05",
    },
  ];

  return (
    <FondifyLayout>
      <div className="mx-auto max-w-[var(--ff-content-max)] space-y-6">
        {/* Page Header */}
        <header className="space-y-3">
          <div className="ff-kicker">{reports.length} REPORTES</div>
          <h1 className="ff-page-title">Todos los reportes</h1>
        </header>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-[var(--ff-text-muted)]" strokeWidth={1.75} />
          <input
            type="search"
            name="q"
            placeholder="Buscar por cliente o archivo…"
            className="w-full rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] bg-[var(--ff-surface)] py-2.5 pl-10 pr-4 text-[var(--ff-fs-sm)] text-[var(--ff-text)] placeholder:text-[var(--ff-text-muted)] focus:border-[var(--ff-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ff-primary)]/20"
          />
        </div>

        {/* Reports Table */}
        <div className="overflow-hidden rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] shadow-[var(--ff-shadow-sm)] ring-1 ring-[var(--ff-border)]">
          {reports.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto mb-4 size-12 text-[var(--ff-text-muted)]" strokeWidth={1.5} />
              <p className="text-sm text-[var(--ff-text-muted)]">
                Aún no hay reportes de crédito generados.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--ff-border)]">
                  <th className="ff-kicker px-5 py-3 text-left">Cliente</th>
                  <th className="ff-kicker px-5 py-3 text-left">Archivo</th>
                  <th className="ff-kicker px-5 py-3 text-left">Fecha</th>
                  <th className="ff-kicker px-5 py-3 text-left">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ff-border)]">
                {reports.map((report) => (
                  <tr key={report.id} className="transition-colors hover:bg-[var(--ff-primary-tint)]">
                    <td className="px-5 py-3">
                      <div className="font-medium text-[var(--ff-text)]">{report.clientName}</div>
                      <div className="text-[11px] text-[var(--ff-text-secondary)]">
                        {report.clientEmail}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="ff-mono text-[11px] text-[var(--ff-text-secondary)]">
                        {report.fileName}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="ff-mono text-[11px] text-[var(--ff-text-secondary)]">
                        {report.date}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/crm/agency/reports/${report.id}`}
                          className="rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] px-3 py-1.5 text-[var(--ff-fs-xs)] font-medium text-[var(--ff-text-secondary)] transition-colors hover:bg-[var(--ff-bg-soft)]"
                        >
                          Ver
                        </Link>
                        <button
                          type="button"
                          className="rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] px-3 py-1.5 text-[var(--ff-fs-xs)] font-medium text-[var(--ff-text-secondary)] transition-colors hover:bg-[var(--ff-bg-soft)]"
                        >
                          PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </FondifyLayout>
  );
}
