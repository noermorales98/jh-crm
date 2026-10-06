import type { Metadata } from "next";
import { Users, FileText, DollarSign, ClipboardList } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { getDashboardSummary } from "@/src/server/dashboard";
import { FondifyLayout, FondifyKpiCard } from "@/src/components/fondify";

export const metadata: Metadata = {
  title: "Resumen · Fondify Agency",
};

export default async function AgencyDashboardPage() {
  const ctx = await requireOrganization();
  const summary = await getDashboardSummary(ctx);
  const { widgets } = summary;

  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: summary.timezone,
  }).format(now);

  return (
    <FondifyLayout>
      <div className="mx-auto max-w-[var(--ff-content-max)] space-y-6">
        {/* Page Header */}
        <header className="space-y-3">
          <div className="ff-kicker">{dateLabel}</div>
          <h1 className="ff-page-title">Resumen de tu agencia</h1>
          <p className="ff-page-subtitle">El estado de tu operación de un vistazo.</p>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FondifyKpiCard
            kicker="CLIENTES"
            value={widgets.activeClients.count}
            hint="Activos en servicio"
            iconClass="bg-[var(--ff-primary-soft)] text-[var(--ff-primary)]"
            icon={<Users className="size-[18px]" strokeWidth={1.75} />}
          />
          <FondifyKpiCard
            kicker="REPORTES GENERADOS"
            value={widgets.openCases.count}
            hint="Total de reportes"
            iconClass="bg-[var(--ff-status-ready-bg)] text-[var(--ff-status-ready-fg)]"
            icon={<FileText className="size-[18px]" strokeWidth={1.75} />}
          />
          <FondifyKpiCard
            kicker="FONDEO POTENCIAL TOTAL"
            value={`$${widgets.pendingPayments.count * 1500}`}
            hint="Estimado total"
            iconClass="bg-[var(--ff-status-struct-bg)] text-[var(--ff-status-struct-fg)]"
            icon={<DollarSign className="size-[18px]" strokeWidth={1.75} />}
          />
          <FondifyKpiCard
            kicker="PDFS DEL PLAN"
            value={widgets.tasksToday.count}
            hint="Planes de acción"
            iconClass="bg-[var(--ff-warning-bg)] text-[var(--ff-warning-fg)]"
            icon={<ClipboardList className="size-[18px]" strokeWidth={1.75} />}
          />
        </div>

        {/* Tus dos enlaces */}
        <section className="space-y-4">
          <h2 className="text-[var(--ff-fs-lg)] font-semibold text-[var(--ff-text)]">
            Tus dos enlaces
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-5 shadow-[var(--ff-shadow-sm)] ring-1 ring-[var(--ff-border)]">
              <h3 className="mb-2 text-sm font-semibold text-[var(--ff-text)]">
                Enlace de registro de cliente
              </h3>
              <div className="ff-mono mb-3 rounded-md bg-[var(--ff-bg-soft)] p-3 text-[11px] text-[var(--ff-text-secondary)]">
                {`https://fondify.io/signup/jh-multiservices`}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-[var(--ff-radius-md)] border border-[var(--ff-primary)] px-4 py-2 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-primary)] transition-colors hover:bg-[var(--ff-primary-soft)]"
                >
                  Copiar
                </button>
                <button
                  type="button"
                  className="rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] px-4 py-2 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text-secondary)] transition-colors hover:bg-[var(--ff-bg-soft)]"
                >
                  Compartir
                </button>
                <button
                  type="button"
                  className="rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] px-4 py-2 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text-secondary)] transition-colors hover:bg-[var(--ff-bg-soft)]"
                  aria-label="Código QR"
                >
                  QR
                </button>
              </div>
            </div>

            <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-5 shadow-[var(--ff-shadow-sm)] ring-1 ring-[var(--ff-border)]">
              <h3 className="mb-2 text-sm font-semibold text-[var(--ff-text)]">
                Enlace de referido de agencia
              </h3>
              <div className="ff-mono mb-3 rounded-md bg-[var(--ff-bg-soft)] p-3 text-[11px] text-[var(--ff-text-secondary)]">
                {`https://fondify.io/referral/jh-multiservices`}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-[var(--ff-radius-md)] border border-[var(--ff-primary)] px-4 py-2 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-primary)] transition-colors hover:bg-[var(--ff-primary-soft)]"
                >
                  Copiar
                </button>
                <button
                  type="button"
                  className="rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] px-4 py-2 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text-secondary)] transition-colors hover:bg-[var(--ff-bg-soft)]"
                >
                  Compartir
                </button>
                <button
                  type="button"
                  className="rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] px-4 py-2 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text-secondary)] transition-colors hover:bg-[var(--ff-bg-soft)]"
                  aria-label="Código QR"
                >
                  QR
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Paneles */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-[var(--ff-fs-lg)] font-semibold text-[var(--ff-text)]">
              Qué funciona
            </h2>
            <div className="min-h-[200px] rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-5 shadow-[var(--ff-shadow-sm)] ring-1 ring-[var(--ff-border)]">
              <p className="text-center text-sm text-[var(--ff-text-muted)]">
                Datos de campañas de marketing próximamente
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[var(--ff-fs-lg)] font-semibold text-[var(--ff-text)]">
              Ganancias potenciales
            </h2>
            <div className="min-h-[200px] rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-5 shadow-[var(--ff-shadow-sm)] ring-1 ring-[var(--ff-border)]">
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-[var(--ff-border)] pb-2">
                  <span className="text-sm text-[var(--ff-text-secondary)]">
                    Comisión estimada
                  </span>
                  <span className="text-sm font-medium text-[var(--ff-text)]">
                    ${widgets.pendingPayments.count * 150}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-base font-semibold text-[var(--ff-text)]">
                    Total
                  </span>
                  <span className="text-xl font-bold text-[var(--ff-magenta)]">
                    ${widgets.pendingPayments.count * 150}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </FondifyLayout>
  );
}
