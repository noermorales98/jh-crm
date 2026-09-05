import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Inbox,
  RefreshCcw,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { getDashboardSummary } from "@/src/server/dashboard";
import { clientFullName } from "@/src/server/page-helpers";
import { ButtonLink, EmptyState, PageHeader } from "@/src/components/ui";
import { DashboardSpotlightField } from "@/src/components/search/dashboard-spotlight-field";
import { DashboardSuggestedChats } from "@/src/components/ai/dashboard-suggested-chats";
import { buildSuggestedChats } from "@/src/lib/ai/suggested-chats";
import { formatDate, formatMoney, formatDateTime } from "@/src/lib/format";

type SummaryKpi = {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number;
  priority: number;
};

/** Elige hasta 3 KPIs con count > 0, ordenados por relevancia. */
function pickSummaryKpis(candidates: SummaryKpi[], limit = 3): SummaryKpi[] {
  return [...candidates]
    .filter((item) => item.value > 0)
    .sort((a, b) => a.priority - b.priority || b.value - a.value)
    .slice(0, limit);
}

export const metadata: Metadata = {
  title: "Inicio",
};

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "danger" | "warning" | "neutral";
  icon: LucideIcon;
  badge?: string;
};

export default async function DashboardPage() {
  const ctx = await requireOrganization();
  const summary = await getDashboardSummary(ctx);
  const { widgets } = summary;
  const tz = summary.timezone;

  const suggestedChats = buildSuggestedChats({
    overdueTasks: widgets.overdueTasks.count,
    tasksToday: widgets.tasksToday.count,
    pendingPayments: widgets.pendingPayments.count,
    overduePayments: widgets.overduePayments.count,
    openCases: widgets.openCases.count,
    documentsPending: widgets.documentsPendingCases.count,
    unreadMails: widgets.unreadMails.count,
    overdueUpdates: widgets.overdueUpdates.count,
    newLeads: widgets.newLeads.count,
    activeRounds: widgets.activeRounds.count,
  });

  const attention: AttentionItem[] = [];

  for (const t of widgets.overdueTasks.items) {
    attention.push({
      id: `task-overdue-${t.id}`,
      title: t.title,
      detail: `Vencida${t.dueAt ? ` · ${formatDate(t.dueAt, tz)}` : ""}${
        t.client ? ` · ${clientFullName(t.client)}` : ""
      }`,
      href: widgets.overdueTasks.link,
      tone: "danger",
      icon: AlertTriangle,
      badge: "Urgente",
    });
  }

  for (const t of widgets.tasksToday.items) {
    attention.push({
      id: `task-today-${t.id}`,
      title: t.title,
      detail: `Para hoy${t.client ? ` · ${clientFullName(t.client)}` : ""}`,
      href: widgets.tasksToday.link,
      tone: "warning",
      icon: ClipboardList,
      badge: "Hoy",
    });
  }

  for (const p of widgets.overduePayments.items) {
    attention.push({
      id: `pay-overdue-${p.id}`,
      title: `Cobrar ${formatMoney(p.amount, p.currency)}`,
      detail: `Pago vencido · ${clientFullName(p.client)}${
        p.dueAt ? ` · ${formatDate(p.dueAt, tz)}` : ""
      }`,
      href: widgets.overduePayments.link,
      tone: "danger",
      icon: CreditCard,
      badge: "Urgente",
    });
  }

  const overduePayIds = new Set(widgets.overduePayments.items.map((p) => p.id));
  for (const p of widgets.pendingPayments.items) {
    if (overduePayIds.has(p.id)) continue;
    attention.push({
      id: `pay-pending-${p.id}`,
      title: `Cobrar ${formatMoney(p.amount, p.currency)}`,
      detail: `Por cobrar · ${clientFullName(p.client)}${
        p.dueAt ? ` · vence ${formatDate(p.dueAt, tz)}` : ""
      }`,
      href: widgets.pendingPayments.link,
      tone: "warning",
      icon: CreditCard,
      badge: "Cobrar",
    });
  }

  for (const c of widgets.overdueUpdates.items) {
    attention.push({
      id: `review-overdue-${c.id}`,
      title: `Revisión vencida · ${c.caseCode}`,
      detail: clientFullName(c.client),
      href: `/crm/casos/${c.id}`,
      tone: "danger",
      icon: AlertTriangle,
      badge: "Urgente",
    });
  }

  for (const c of widgets.documentsPendingCases.items.slice(0, 5)) {
    attention.push({
      id: `docs-${c.id}`,
      title: `Documentos pendientes · ${c.caseCode}`,
      detail: clientFullName(c.client),
      href: `/crm/casos/${c.id}`,
      tone: "warning",
      icon: FileText,
      badge: "Docs",
    });
  }

  const summaryKpis = pickSummaryKpis([
    {
      href: widgets.openCases.link,
      icon: Briefcase,
      label: "Casos abiertos",
      value: widgets.openCases.count,
      priority: 1,
    },
    {
      href: widgets.activeRounds.link,
      icon: RefreshCcw,
      label: "Rondas en curso",
      value: widgets.activeRounds.count,
      priority: 2,
    },
    {
      href: widgets.activeClients.link,
      icon: Users,
      label: "Clientes activos",
      value: widgets.activeClients.count,
      priority: 3,
    },
    {
      href: widgets.pendingPayments.link,
      icon: CreditCard,
      label: "Por cobrar",
      value: widgets.pendingPayments.count,
      priority: 4,
    },
    {
      href: widgets.overdueTasks.link,
      icon: AlertTriangle,
      label: "Tareas vencidas",
      value: widgets.overdueTasks.count,
      priority: 5,
    },
    {
      href: widgets.tasksToday.link,
      icon: ClipboardList,
      label: "Tareas de hoy",
      value: widgets.tasksToday.count,
      priority: 6,
    },
    {
      href: widgets.documentsPendingCases.link,
      icon: FileText,
      label: "Docs pendientes",
      value: widgets.documentsPendingCases.count,
      priority: 7,
    },
    {
      href: widgets.newLeads.link,
      icon: Users,
      label: "Leads nuevos",
      value: widgets.newLeads.count,
      priority: 8,
    },
    {
      href: widgets.unreadMails.link,
      icon: Inbox,
      label: "Mensajes sin leer",
      value: widgets.unreadMails.count,
      priority: 9,
    },
  ]);

  const summaryCols =
    summaryKpis.length >= 3
      ? "sm:grid-cols-3"
      : summaryKpis.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-1";

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-1">
        <PageHeader
          title="¿Qué hacer hoy?"
          description={`Actualizado ${formatDateTime(summary.generatedAt, tz)}`}
        />
      </header>

      {/* Lista primaria: una pregunta, una acción por fila */}
      <section aria-labelledby="today-attention-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 px-0.5">
          <h2
            id="today-attention-heading"
            className="text-[15px] font-semibold tracking-[-0.01em] text-ink"
          >
            Para hacer hoy
            {attention.length > 0 ? (
              <span className="ml-2 tabular-nums font-medium text-text-secondary">
                {attention.length}
              </span>
            ) : null}
          </h2>
          {attention.length > 0 ? (
            <Link
              href="/crm/tareas"
              className="min-h-11 inline-flex items-center text-[13px] font-medium text-action-primary hover:text-action-secondary"
            >
              Ver todas
            </Link>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[14px] bg-surface-elevated ring-1 ring-border-subtle/50">
          {attention.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No hay nada urgente"
              description="Buen momento para revisar clientes o buscar algo."
              action={
                <ButtonLink href="/crm/clientes" size="sm">
                  <Users className="size-4" aria-hidden />
                  Ver clientes
                </ButtonLink>
              }
            />
          ) : (
            <ul role="list">
              {attention.map((item, index) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={`group flex min-h-14 items-center gap-3.5 px-4 py-3 transition-colors duration-200 hover:bg-nav-hover motion-reduce:transition-none sm:px-5 ${
                        index > 0 ? "border-t border-border-subtle/60" : ""
                      }`}
                    >
                      <span
                        className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
                          item.tone === "danger"
                            ? "bg-danger-soft text-danger-ink"
                            : item.tone === "warning"
                              ? "bg-warning-soft text-warning-ink"
                              : "bg-nav-active text-action-primary"
                        }`}
                        aria-hidden
                      >
                        <Icon className="size-[18px]" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-[15px] font-medium tracking-[-0.01em] text-ink">
                            {item.title}
                          </p>
                          {item.badge ? (
                            <span
                              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                item.tone === "danger"
                                  ? "bg-danger-soft text-danger-ink"
                                  : "bg-surface-panel text-text-secondary-strong"
                              }`}
                            >
                              {item.badge}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-[13px] leading-snug text-text-secondary">
                          {item.detail}
                        </p>
                      </div>
                      <ChevronRight
                        className="size-5 shrink-0 text-text-secondary/70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-text-secondary-strong motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                        aria-hidden
                      />
                      <span className="sr-only">Abrir</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Resumen secundario: métricas solo si hay datos */}
      {summaryKpis.length > 0 ? (
        <section aria-labelledby="summary-heading" className="space-y-3">
          <h2
            id="summary-heading"
            className="px-0.5 text-[15px] font-semibold tracking-[-0.01em] text-ink"
          >
            Resumen
          </h2>
          <div className={`grid gap-2.5 ${summaryCols}`}>
            {summaryKpis.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="group flex min-h-[4.5rem] items-center gap-3.5 rounded-[14px] bg-surface-elevated px-4 py-3.5 ring-1 ring-border-subtle/50 transition-colors duration-200 hover:bg-nav-hover motion-reduce:transition-none sm:px-5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-nav-active text-action-primary">
                    <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
                      {item.value}
                    </p>
                    <p className="mt-1.5 text-[13px] leading-snug text-text-secondary">
                      {item.label}
                    </p>
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0 text-text-secondary/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <DashboardSpotlightField />

      <DashboardSuggestedChats suggestions={suggestedChats} />
    </div>
  );
}
