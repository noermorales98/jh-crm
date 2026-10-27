import type { Metadata } from "next";
import { Suspense } from "react";
import { can } from "@/src/server/auth/permissions";
import { ClientQualification } from "@/src/components/dashboard/client-qualification";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileSignature,
  FileText,
  Mail,
  RefreshCw,
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
import {
  RESUMEN_KPI_DEFS,
  RESUMEN_UPDATE_CTA_HINT,
  RESUMEN_UPDATE_CTA_HREF,
  RESUMEN_UPDATE_CTA_LABEL,
  type ResumenKpiKey,
} from "@/src/lib/dashboard/resumen-kpis";

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

  const resumenCounts: Record<ResumenKpiKey, number> = {
    fundingSignals: widgets.fundingSignals.count,
    reviewDue: widgets.reviewDue.count,
    inRepair: widgets.inRepair.count,
    recentReports: widgets.recentReports.count,
  };

  type LedgerCell = {
    key: string;
    href: string;
    label: string;
    value: number;
    hint: string;
    /** Azul solo en lo vencido o por cobrar. */
    signal: boolean;
  };

  const ledger: LedgerCell[] = [
    {
      key: "active",
      href: widgets.activeClients.link,
      label: "Clientes activos",
      value: widgets.activeClients.count,
      hint: "En servicio",
      signal: false,
    },
    {
      key: "cases",
      href: widgets.openCases.link,
      label: "Casos abiertos",
      value: widgets.openCases.count,
      hint: "En curso",
      signal: false,
    },
    {
      key: "collect",
      href: widgets.pendingPayments.link,
      label: "Por cobrar",
      value: widgets.pendingPayments.count,
      hint: "Pagos pendientes",
      signal: widgets.pendingPayments.count > 0,
    },
    {
      key: "today",
      href: widgets.tasksToday.link,
      label: "Pendientes hoy",
      value: widgets.tasksToday.count + widgets.overdueTasks.count,
      hint:
        widgets.overdueTasks.count > 0
          ? `${widgets.overdueTasks.count} vencidas`
          : "Tareas a atender",
      signal: widgets.overdueTasks.count > 0,
    },
    ...RESUMEN_KPI_DEFS.map((def) => ({
      key: def.key,
      href: def.href,
      label: def.label,
      value: resumenCounts[def.key],
      hint: def.hint,
      signal: false,
    })),
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

  const visibleAttention = attention.slice(0, 6);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex items-start gap-3">
        <div className="relative size-8 shrink-0 overflow-hidden rounded-full">
          <Image
            src="/avatar.png"
            alt=""
            width={32}
            height={32}
            className="size-8 object-cover"
            sizes="32px"
            priority
          />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] text-text-secondary">{dateLabel}</p>
          <h1 className="mt-1 text-[24px] font-medium leading-tight tracking-[-0.02em] text-ink">
            {greeting}, {firstName}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-snug text-ink">{brief}</p>
        </div>
      </header>

      <section aria-labelledby="today-attention-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="today-attention-heading"
            className="text-[16px] font-medium text-ink"
          >
            Para hacer
            {attention.length > 0 ? (
              <span className="ml-2 tabular-nums font-normal text-text-secondary">
                {attention.length}
              </span>
            ) : null}
          </h2>
          {attention.length > 0 ? (
            <Link
              href="/crm/tareas"
              className="inline-flex min-h-11 items-center text-[13px] font-medium text-ink hover:text-text-secondary-strong"
            >
              Ver pendientes
            </Link>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[8px] border border-border-subtle bg-surface-elevated">
          {attention.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No hay nada urgente"
              description="Buen momento para revisar clientes o buscar algo."
              action={
                <ButtonLink href="/crm/clientes" size="sm" variant="secondary">
                  <Users className="size-4" aria-hidden />
                  Ver clientes
                </ButtonLink>
              }
            />
          ) : (
            <ul role="list">
              {visibleAttention.map((item, index) => {
                const Icon = item.icon;
                const needsAction = item.tone === "danger" || item.badge === "Cobrar";
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={`flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-nav-hover sm:px-5 ${
                        index > 0 ? "border-t border-border-subtle" : ""
                      }`}
                    >
                      <Icon
                        className="size-4 shrink-0 text-text-secondary"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-ink">
                          {item.title}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] leading-snug text-text-secondary">
                          {item.detail}
                        </p>
                      </div>
                      {item.badge ? (
                        <Pill tone={needsAction ? "indigo" : "slate"}>{item.badge}</Pill>
                      ) : null}
                      <ChevronRight
                        className="size-4 shrink-0 text-text-secondary"
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

      <section aria-labelledby="resumen-ops-heading" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="resumen-ops-heading"
              className="text-[16px] font-medium text-ink"
            >
              Resumen operación
            </h2>
            <p className="mt-0.5 text-[12px] text-text-secondary">
              Revisión, reparación y señales de fondeo (heurística JH)
            </p>
          </div>
          <ButtonLink href={RESUMEN_UPDATE_CTA_HREF} size="sm">
            <RefreshCw className="size-4" aria-hidden />
            {RESUMEN_UPDATE_CTA_LABEL}
          </ButtonLink>
        </div>
        <p className="text-[12px] text-text-secondary">{RESUMEN_UPDATE_CTA_HINT}</p>
        <h2 id="kpi-heading" className="sr-only">
          Indicadores
        </h2>
        <div className="grid grid-cols-1 overflow-hidden rounded-[8px] border border-border-subtle bg-surface-elevated lg:grid-cols-4">
          {ledger.map((cell) => (
            <Link
              key={cell.key}
              href={cell.href}
              className="flex min-h-14 flex-col justify-center border-b border-border-subtle px-4 py-3 hover:bg-nav-hover last:border-b-0 lg:border-r lg:[&:nth-child(4n)]:border-r-0 lg:[&:nth-child(n+5)]:border-b-0"
            >
              <p className="text-[13px] font-medium text-ink">{cell.label}</p>
              <p
                className={`mt-1 text-[30px] font-normal leading-none tabular-nums ${
                  cell.signal
                    ? "text-action-primary"
                    : cell.value === 0
                      ? "text-text-secondary"
                      : "text-ink"
                }`}
              >
                {cell.value}
              </p>
              <p
                className={`mt-1 text-[12px] leading-snug ${
                  cell.signal ? "text-action-primary" : "text-text-secondary"
                }`}
              >
                {cell.hint}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {can(ctx.role, "creditReports.view") ? (
        <Suspense fallback={null}>
          <ClientQualification ctx={ctx} />
        </Suspense>
      ) : null}

      <div className="grid items-stretch gap-8 lg:grid-cols-2">
        <section
          aria-labelledby="entity-summaries-heading"
          className="flex h-full min-h-0 flex-col gap-3"
        >
          <div className="flex min-h-11 items-start justify-between gap-3">
            <div className="min-w-0 pt-0.5">
              <h2
                id="entity-summaries-heading"
                className="text-[16px] font-medium text-ink"
              >
                Resúmenes
              </h2>
              <p className="mt-0.5 text-[12px] text-text-secondary">
                Contadores del CRM
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-center" aria-hidden>
              <span className="inline-flex min-h-11 items-center text-[13px] font-medium opacity-0">
                Ver todos
              </span>
              <span className="inline-flex h-8 min-w-[4.5rem]" />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-border-subtle bg-surface-elevated">
            <ul role="list" className="flex flex-1 flex-col">
              {summaryList.map((item, index) => {
                const Icon = item.icon;
                return (
                  <li key={item.key} className="flex flex-1">
                    <Link
                      href={item.href}
                      className={`flex min-h-14 w-full flex-1 items-center gap-3 px-4 py-2.5 text-left hover:bg-nav-hover sm:px-5 ${
                        index > 0 ? "border-t border-border-subtle" : ""
                      }`}
                    >
                      <Icon
                        className="size-4 shrink-0 text-text-secondary"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-ink">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-text-secondary">
                          {item.subtitle}
                        </span>
                      </span>
                      <span
                        className={`tabular-nums text-[18px] font-normal ${
                          item.count === 0 ? "text-text-secondary" : "text-ink"
                        }`}
                      >
                        {item.count}
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-text-secondary"
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
