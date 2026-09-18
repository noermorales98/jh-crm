import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileSignature,
  FileText,
  Mail,
  Users,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  requireOrganization,
  requireSession,
} from "@/src/server/auth/guards";
import { getDashboardSummary } from "@/src/server/dashboard";
import { listAttentionTasks } from "@/src/server/tasks";
import { clientFullName } from "@/src/server/page-helpers";
import { ButtonLink, EmptyState, Pill } from "@/src/components/ui";
import { DashboardSuggestedChats } from "@/src/components/ai/dashboard-suggested-chats";
import { buildSuggestedChats } from "@/src/lib/ai/suggested-chats";
import {
  buildDashboardBrief,
  firstNameFromDisplayName,
  greetingForTimezone,
} from "@/src/lib/dashboard-brief";
import { formatDate } from "@/src/lib/format";

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
  const [ctx, session] = await Promise.all([
    requireOrganization(),
    requireSession(),
  ]);
  const summary = await getDashboardSummary(ctx);
  const { widgets } = summary;
  const tz = summary.timezone;

  const greeting = greetingForTimezone(summary.generatedAt, tz);
  const firstName = firstNameFromDisplayName(session.user.name);
  const brief = buildDashboardBrief({
    overdueTasks: widgets.overdueTasks.count,
    overduePayments: widgets.overduePayments.count,
    overdueUpdates: widgets.overdueUpdates.count,
    tasksToday: widgets.tasksToday.count,
    openCases: widgets.openCases.count,
    pendingPayments: widgets.pendingPayments.count,
    leadsToContact: widgets.leadsToContact.count,
    documentsPending: widgets.documentsPendingCases.count,
    activeClients: widgets.activeClients.count,
  });

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

  const attentionRows = await listAttentionTasks(ctx, {
    take: 12,
    timezone: tz,
  });

  const attention: AttentionItem[] = attentionRows.map((row) => {
    const icon =
      row.badge === "Urgente"
        ? AlertTriangle
        : row.badge === "Hoy"
          ? ClipboardList
          : row.badge === "Cobrar"
            ? CreditCard
            : row.badge === "Docs"
              ? FileText
              : row.badge === "Lead"
                ? Target
                : row.badge === "Próxima"
                  ? CalendarClock
                  : ClipboardList;
    const detailParts = [
      row.client ? clientFullName(row.client) : null,
      row.case?.caseCode ?? null,
      row.dueAt ? formatDate(row.dueAt, tz) : null,
    ].filter(Boolean);
    return {
      id: row.id,
      title: row.title,
      detail: detailParts.join(" · ") || row.detail,
      href: row.href,
      tone: row.tone,
      icon,
      badge: row.badge,
    };
  });

  const summaryCols = "sm:grid-cols-2 lg:grid-cols-4";

  const fixedKpis = [
    {
      href: widgets.activeClients.link,
      icon: Users,
      label: "Clientes activos",
      value: widgets.activeClients.count,
      hint: "En servicio",
      iconClass: "bg-nav-active text-action-primary",
    },
    {
      href: widgets.openCases.link,
      icon: Briefcase,
      label: "Casos abiertos",
      value: widgets.openCases.count,
      hint: "En curso",
      iconClass: "bg-info-soft text-info-ink",
    },
    {
      href: widgets.pendingPayments.link,
      icon: CreditCard,
      label: "Por cobrar",
      value: widgets.pendingPayments.count,
      hint: "Pagos pendientes",
      iconClass: "bg-warning-soft text-warning-ink",
    },
    {
      href: widgets.tasksToday.link,
      icon: ClipboardList,
      label: "Pendientes hoy",
      value: widgets.tasksToday.count + widgets.overdueTasks.count,
      hint: "Tareas a atender",
      iconClass: "bg-success-soft text-success-ink",
    },
  ];

  type SummaryListItem = {
    key: string;
    title: string;
    subtitle: string;
    count: number;
    href: string;
    icon: LucideIcon;
  };

  const summaryList: SummaryListItem[] = [
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
      key: "quotes",
      title: "Cotizaciones",
      subtitle: "Enviadas por cerrar",
      count: widgets.pendingQuotes.count,
      href: widgets.pendingQuotes.link,
      icon: FileSignature,
    },
    {
      key: "rounds",
      title: "Rondas",
      subtitle: "Revisiones próximas",
      count: widgets.upcomingReviews.rounds.length,
      href: "/crm/rondas",
      icon: Target,
    },
  ];

  const dateLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: tz,
  }).format(summary.generatedAt);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
          {dateLabel}
        </p>
        <div className="flex items-center gap-3.5">
          <div className="relative size-11 shrink-0 overflow-hidden rounded-full ring-1 ring-border-subtle/60">
            <Image
              src="/avatar.png"
              alt=""
              width={44}
              height={44}
              className="size-11 object-cover"
              sizes="44px"
              priority
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[32px]">
              {greeting}, {firstName}
            </h1>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-snug text-text-secondary">
              {brief}
            </p>
          </div>
        </div>
      </header>

      <section aria-labelledby="kpi-heading" className="space-y-3">
        <h2 id="kpi-heading" className="sr-only">
          Indicadores
        </h2>
        <div className={`grid gap-3 ${summaryCols}`}>
          {fixedKpis.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className="group rounded-[18px] bg-surface-elevated p-4 ring-1 ring-border-subtle/40 transition-colors hover:bg-nav-hover sm:p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`flex size-10 items-center justify-center rounded-xl ${item.iconClass}`}
                  >
                    <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                  </span>
                  <ChevronRight
                    className="size-4 text-text-secondary opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </div>
                <p className="mt-4 text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums text-ink">
                  {item.value}
                </p>
                <p className="mt-2 text-[13px] font-medium text-ink">{item.label}</p>
                <p className="mt-0.5 text-[11px] text-text-secondary">{item.hint}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Lista: una acción por fila */}
      <section aria-labelledby="today-attention-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 px-0.5">
          <h2
            id="today-attention-heading"
            className="text-[13px] font-semibold text-text-secondary-strong"
          >
            Para hacer
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
              Ver pendientes
            </Link>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[18px] bg-surface-elevated ring-1 ring-border-subtle/40">
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
              {attention.slice(0, 12).map((item, index) => {
                const Icon = item.icon;
                const badgeTone =
                  item.tone === "danger"
                    ? "red"
                    : item.tone === "warning"
                      ? "amber"
                      : "slate";
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={`group flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors duration-200 hover:bg-nav-hover motion-reduce:transition-none sm:px-5 ${
                        index > 0 ? "border-t border-border-subtle/40" : ""
                      }`}
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                          item.tone === "danger"
                            ? "bg-danger-soft text-danger-ink"
                            : item.tone === "warning"
                              ? "bg-warning-soft text-warning-ink"
                              : "bg-nav-active text-action-primary"
                        }`}
                        aria-hidden
                      >
                        <Icon className="size-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-ink">
                          {item.title}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] leading-snug text-text-secondary">
                          {item.detail}
                        </p>
                      </div>
                      {item.badge ? (
                        <Pill tone={badgeTone}>{item.badge}</Pill>
                      ) : null}
                      <ChevronRight
                        className="size-4 shrink-0 text-text-secondary transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
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

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="entity-summaries-heading"
          className="flex h-full min-h-0 flex-col gap-3"
        >
          <div className="flex min-h-11 items-start justify-between gap-3 px-0.5">
            <div className="min-w-0 pt-0.5">
              <h2
                id="entity-summaries-heading"
                className="text-[13px] font-semibold text-text-secondary-strong"
              >
                Resúmenes
              </h2>
              <p className="mt-0.5 text-[12px] text-text-secondary">
                Contadores del CRM
              </p>
            </div>
            {/* Misma altura de acciones que Chats sugeridos */}
            <div className="flex shrink-0 items-center gap-2 self-center" aria-hidden>
              <span className="min-h-11 inline-flex items-center text-[13px] font-medium opacity-0">
                Ver todos
              </span>
              <span className="inline-flex h-8 min-w-[4.5rem]" />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-surface-elevated ring-1 ring-border-subtle/50">
            <ul role="list" className="flex flex-1 flex-col">
              {summaryList.map((item, index) => {
                const Icon = item.icon;
                return (
                  <li key={item.key} className="flex flex-1">
                    <Link
                      href={item.href}
                      className={`group flex min-h-14 w-full flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-nav-hover motion-reduce:transition-none sm:px-5 ${
                        index > 0 ? "border-t border-border-subtle/60" : ""
                      }`}
                    >
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-nav-active text-action-primary"
                        aria-hidden
                      >
                        <Icon className="size-4" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-ink">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-text-secondary">
                          {item.subtitle}
                        </span>
                      </span>
                      <span className="tabular-nums text-[18px] font-semibold tracking-[-0.02em] text-ink">
                        {item.count}
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-text-secondary transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <DashboardSuggestedChats suggestions={suggestedChats} />
      </div>
    </div>
  );
}
