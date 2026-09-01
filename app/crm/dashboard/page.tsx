import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  ClipboardList,
  CreditCard,
  RefreshCcw,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { getDashboardSummary } from "@/src/server/dashboard";
import { clientFullName } from "@/src/server/page-helpers";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill } from "@/src/components/ui";
import { formatDate, formatMoney, formatDateTime } from "@/src/lib/format";
import { TASK_PRIORITY_LABELS, labelFor } from "@/src/lib/labels";

export const metadata: Metadata = {
  title: "Dashboard",
};

function KpiCard({
  href,
  icon: Icon,
  label,
  value,
  hint,
  accent = "indigo",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  accent?: "indigo" | "red" | "amber" | "green";
}) {
  const accents = {
    indigo: "bg-nav-active text-action-primary",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-emerald-50 text-emerald-600",
  }[accent];

  return (
    <Link
      href={href}
      className="group rounded-surface bg-surface-elevated p-5 transition-colors duration-200 hover:bg-nav-hover motion-reduce:transition-none"
    >
      <div className="flex items-center justify-between">
        <span className={`flex size-9 items-center justify-center rounded-control ${accents}`}>
          <Icon className="size-4.5" aria-hidden />
        </span>
        <ArrowRight
          className="size-4 text-brand-silver transition-colors group-hover:text-action-primary"
          aria-hidden
        />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-ink">
        {value}
      </p>
      <p className="mt-0.5 text-sm text-text-secondary">{label}</p>
      {hint ? <p className="mt-1 text-xs text-text-secondary">{hint}</p> : null}
    </Link>
  );
}

export default async function DashboardPage() {
  const ctx = await requireOrganization();
  const summary = await getDashboardSummary(ctx);
  const { widgets } = summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Resumen operativo · generado ${formatDateTime(summary.generatedAt, summary.timezone)} (${summary.timezone})`}
      />

      {/* KPIs accionables: cada tarjeta enlaza a su lista filtrada */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          href={widgets.activeClients.link}
          icon={Users}
          label="Clientes activos"
          value={widgets.activeClients.count}
        />
        <KpiCard
          href={widgets.openCases.link}
          icon={Briefcase}
          label="Casos abiertos"
          value={widgets.openCases.count}
        />
        <KpiCard
          href={widgets.activeRounds.link}
          icon={RefreshCcw}
          label="Rondas en curso"
          value={widgets.activeRounds.count}
        />
        <KpiCard
          href={widgets.overdueTasks.link}
          icon={AlertTriangle}
          label="Tareas vencidas"
          value={widgets.overdueTasks.count}
          accent={widgets.overdueTasks.count > 0 ? "red" : "indigo"}
        />
        <KpiCard
          href={widgets.tasksToday.link}
          icon={ClipboardList}
          label="Tareas de hoy"
          value={widgets.tasksToday.count}
          accent={widgets.tasksToday.count > 0 ? "amber" : "indigo"}
        />
        <KpiCard
          href={widgets.pendingPayments.link}
          icon={CreditCard}
          label="Pagos pendientes"
          value={widgets.pendingPayments.count}
          hint={formatMoney(widgets.pendingPayments.totalAmount)}
          accent={widgets.pendingPayments.count > 0 ? "amber" : "indigo"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revisiones próximas: casos y rondas con fecha */}
        <Card>
          <CardHeader
            title="Revisiones próximas"
            description="Casos y rondas con fecha de revisión en los próximos 14 días o vencidas."
            actions={
              <Link
                href="/crm/rondas"
                className="text-xs font-medium text-action-primary hover:text-action-secondary"
              >
                Ver rondas →
              </Link>
            }
          />
          <CardBody className="p-0">
            {widgets.casesWaitingUpdate.items.length === 0 &&
            widgets.upcomingReviews.cases.length === 0 &&
            widgets.upcomingReviews.rounds.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Sin revisiones próximas"
                description="No hay casos ni rondas con revisión programada."
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {widgets.casesWaitingUpdate.items.map((c) => (
                  <li key={`wait-${c.id}`}>
                    <Link
                      href={`/crm/casos/${c.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-nav-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {c.caseCode} · {clientFullName(c.client)}
                        </p>
                        <p className="text-xs text-text-secondary">
                          Esperando actualización
                        </p>
                      </div>
                      <span className="shrink-0 text-xs">
                        {c.nextReviewAt && new Date(c.nextReviewAt) < summary.generatedAt ? (
                          <Pill tone="red">Vencida {formatDate(c.nextReviewAt, summary.timezone)}</Pill>
                        ) : c.nextReviewAt ? (
                          <Pill tone="amber">{formatDate(c.nextReviewAt, summary.timezone)}</Pill>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
                {widgets.upcomingReviews.cases.map((c) => (
                  <li key={`case-${c.id}`}>
                    <Link
                      href={`/crm/casos/${c.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-nav-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {c.caseCode} · {clientFullName(c.client)}
                        </p>
                        <p className="text-xs text-text-secondary">Revisión de caso</p>
                      </div>
                      {c.nextReviewAt ? (
                        <span className="shrink-0 text-xs text-text-secondary">
                          {formatDate(c.nextReviewAt, summary.timezone)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
                {widgets.upcomingReviews.rounds.map((r) => (
                  <li key={`round-${r.id}`}>
                    <Link
                      href={`/crm/casos/${r.case.id}/rondas`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-nav-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          Ronda {r.roundNumber} · {r.case.caseCode} ·{" "}
                          {clientFullName(r.case.client)}
                        </p>
                        <p className="text-xs text-text-secondary">
                          Revisión de ronda enviada
                        </p>
                      </div>
                      {r.expectedReviewAt ? (
                        <span className="shrink-0 text-xs text-text-secondary">
                          {formatDate(r.expectedReviewAt, summary.timezone)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Tareas de hoy y vencidas */}
        <Card>
          <CardHeader
            title="Tareas de hoy"
            description={`${widgets.tasksToday.count} para hoy · ${widgets.overdueTasks.count} vencidas.`}
            actions={
              <Link
                href="/crm/tareas"
                className="text-xs font-medium text-action-primary hover:text-action-secondary"
              >
                Ver tareas →
              </Link>
            }
          />
          <CardBody className="p-0">
            {widgets.tasksToday.items.length === 0 &&
            widgets.overdueTasks.items.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Nada pendiente"
                description="No hay tareas para hoy ni vencidas."
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {widgets.overdueTasks.items.map((t) => (
                  <li key={`over-${t.id}`}>
                    <Link
                      href="/crm/tareas?due=overdue"
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-nav-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {t.title}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {t.client ? clientFullName(t.client) : "Sin cliente"}
                          {t.assignedTo ? ` · ${t.assignedTo.name}` : ""}
                        </p>
                      </div>
                      {t.dueAt ? (
                        <Pill tone="red">Venció {formatDate(t.dueAt, summary.timezone)}</Pill>
                      ) : null}
                    </Link>
                  </li>
                ))}
                {widgets.tasksToday.items.map((t) => (
                  <li key={`today-${t.id}`}>
                    <Link
                      href="/crm/tareas?due=today"
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-nav-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {t.title}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {t.client ? clientFullName(t.client) : "Sin cliente"} ·{" "}
                          {labelFor(TASK_PRIORITY_LABELS, t.priority)}
                        </p>
                      </div>
                      {t.dueAt ? (
                        <span className="shrink-0 text-xs text-text-secondary">
                          {formatDate(t.dueAt, summary.timezone)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Pagos pendientes */}
        <Card>
          <CardHeader
            title="Pagos pendientes"
            description={`Total por cobrar: ${formatMoney(widgets.pendingPayments.totalAmount)}.`}
            actions={
              <Link
                href={widgets.pendingPayments.link}
                className="text-xs font-medium text-action-primary hover:text-action-secondary"
              >
                Ver pagos →
              </Link>
            }
          />
          <CardBody className="p-0">
            {widgets.pendingPayments.items.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="Sin pagos pendientes"
                description="No hay pagos registrados por cobrar."
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {widgets.pendingPayments.items.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {formatMoney(p.amount, p.currency)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {clientFullName(p.client)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-text-secondary">
                      {p.dueAt
                        ? `Vence ${formatDate(p.dueAt, summary.timezone)}`
                        : "Sin vencimiento"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Cotizaciones enviadas + pagos recientes */}
        <Card>
          <CardHeader
            title="Actividad comercial"
            description={`${widgets.pendingQuotes.count} cotizaciones enviadas por responder.`}
            actions={
              <Link
                href={widgets.pendingQuotes.link}
                className="text-xs font-medium text-action-primary hover:text-action-secondary"
              >
                Ver cotizaciones →
              </Link>
            }
          />
          <CardBody className="p-0">
            {widgets.recentReceivedPayments.items.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="Sin pagos recientes"
                description="No se han recibido pagos en los últimos 7 días."
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {widgets.recentReceivedPayments.items.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {formatMoney(p.amount, p.currency)} · {clientFullName(p.client)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {p.receipt ? `Recibo ${p.receipt.folio}` : "Sin recibo"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-text-secondary">
                      {p.receivedAt ? formatDate(p.receivedAt, summary.timezone) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
