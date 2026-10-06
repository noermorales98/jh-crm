import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Mail,
  Target,
  Users,
} from "lucide-react";
import {
  requireOrganization,
  requireSession,
} from "@/src/server/auth/guards";
import { getDashboardSummary } from "@/src/server/dashboard";
import { KpiCard, PageHeaderFondify } from "@/src/components/fondify";
// formatDate not needed in this page
import { clientFullName } from "@/src/server/page-helpers";

export const metadata: Metadata = {
  title: "Inicio",
};

export default async function DashboardPageFondify() {
  const [ctx, session] = await Promise.all([
    requireOrganization(),
    requireSession(),
  ]);
  const summary = await getDashboardSummary(ctx);
  const { widgets } = summary;
  const tz = summary.timezone;

  const dateLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  })
    .format(summary.generatedAt)
    .toUpperCase();

  const firstName =
    session.user.name?.split(" ")[0] ?? session.user.email?.split("@")[0] ?? "Usuario";

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Buenos días";
    if (hour < 19) return "Buenas tardes";
    return "Buenas noches";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeaderFondify
        kicker={dateLabel}
        title={`Resumen de tu agencia`}
        subtitle={`${greeting()}, ${firstName}. Aquí está el estado de tu operación.`}
      />

      <section aria-labelledby="kpi-heading" className="space-y-4">
        <h2 id="kpi-heading" className="sr-only">
          Indicadores principales
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            kicker="CLIENTES ACTIVOS"
            value={widgets.activeClients.count}
            subtitle="En servicio"
            href={widgets.activeClients.link}
            icon={Users}
            variant="default"
          />
          <KpiCard
            kicker="CASOS ABIERTOS"
            value={widgets.openCases.count}
            subtitle="En curso"
            href={widgets.openCases.link}
            icon={Briefcase}
            variant="default"
          />
          <KpiCard
            kicker="POR COBRAR"
            value={widgets.pendingPayments.count}
            subtitle="Pagos pendientes"
            href={widgets.pendingPayments.link}
            icon={CreditCard}
            variant={widgets.pendingPayments.count > 0 ? "danger" : "default"}
          />
          <KpiCard
            kicker="PENDIENTES HOY"
            value={widgets.tasksToday.count + widgets.overdueTasks.count}
            subtitle={
              widgets.overdueTasks.count > 0
                ? `${widgets.overdueTasks.count} vencidas`
                : "Tareas a atender"
            }
            href={widgets.tasksToday.link}
            icon={ClipboardList}
            variant={widgets.overdueTasks.count > 0 ? "danger" : "default"}
          />
        </div>
      </section>

      <section aria-labelledby="summary-heading" className="space-y-4">
        <h2
          id="summary-heading"
          className="text-[var(--ff-fs-sm)] font-semibold text-[var(--ff-text-secondary)]"
        >
          Resúmenes
        </h2>
        <div className="overflow-hidden rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] shadow-[var(--ff-shadow-sm)]">
          <ul role="list">
            {[
              {
                key: "docs",
                title: "Docs pendientes",
                subtitle: "Casos sin documentos listos",
                count: widgets.documentsPendingCases.count,
                href: widgets.documentsPendingCases.link,
                icon: FileText,
              },
              {
                key: "mails",
                title: "Correos sin leer",
                subtitle: "Bandeja de entrada",
                count: widgets.unreadMails.count,
                href: widgets.unreadMails.link,
                icon: Mail,
              },
              {
                key: "rounds",
                title: "Rondas activas",
                subtitle: "Revisiones próximas",
                count: widgets.activeRounds.count,
                href: "/crm/rondas",
                icon: Target,
              },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={`group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--ff-primary-tint)] ${
                      index > 0 ? "border-t border-[var(--ff-border)]" : ""
                    }`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ff-primary-soft)] text-[var(--ff-primary)]">
                      <Icon className="size-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[var(--ff-fs-base)] font-medium text-[var(--ff-text)]">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-[var(--ff-fs-sm)] text-[var(--ff-text-secondary)]">
                        {item.subtitle}
                      </span>
                    </span>
                    <span className="tabular-nums text-[var(--ff-fs-lg)] font-semibold text-[var(--ff-text)]">
                      {item.count}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-[var(--ff-text-secondary)] transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
