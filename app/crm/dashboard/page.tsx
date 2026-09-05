import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileText,
  RefreshCcw,
  Scale,
  TrendingUp,
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
  title: "Inicio",
};

function KpiStrip({
  items,
}: {
  items: {
    href: string;
    icon: LucideIcon;
    label: string;
    value: string | number;
    hint?: string;
    attention?: "danger" | "warning";
  }[];
}) {
  return (
    <div className="overflow-hidden rounded-surface bg-border-subtle">
      <div className="grid grid-cols-2 gap-px lg:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => {
          const Icon = item.icon;
          const wellClass =
            item.attention === "danger"
              ? "bg-danger-soft text-danger-ink"
              : item.attention === "warning"
                ? "bg-warning-soft text-warning-ink"
                : "bg-nav-active text-action-primary";
          return (
            <Link
              key={item.href + item.label}
              href={item.href}
              className="group flex flex-col gap-3 bg-surface-elevated p-4 transition-colors duration-200 hover:bg-nav-hover motion-reduce:transition-none sm:p-5"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex size-8 items-center justify-center rounded-control ${wellClass}`}
                >
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                </span>
                <ArrowRight
                  className="size-4 text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ink">
                  {item.value}
                </p>
                <p className="mt-0.5 text-sm text-text-secondary">{item.label}</p>
                {item.hint ? (
                  <p className="mt-1 text-xs text-text-secondary">{item.hint}</p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const ctx = await requireOrganization();
  const summary = await getDashboardSummary(ctx);
  const { widgets } = summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inicio"
        description={`Lo que requiere atención hoy · actualizado ${formatDateTime(summary.generatedAt, summary.timezone)}`}
      />

      <KpiStrip
        items={[
          {
            href: widgets.activeClients.link,
            icon: Users,
            label: "Clientes activos",
            value: widgets.activeClients.count,
          },
          {
            href: widgets.openCases.link,
            icon: Briefcase,
            label: "Casos abiertos",
            value: widgets.openCases.count,
          },
          {
            href: widgets.activeRounds.link,
            icon: RefreshCcw,
            label: "Rondas en curso",
            value: widgets.activeRounds.count,
          },
          {
            href: widgets.overdueTasks.link,
            icon: AlertTriangle,
            label: "Tareas vencidas",
            value: widgets.overdueTasks.count,
            attention: widgets.overdueTasks.count > 0 ? "danger" : undefined,
          },
          {
            href: widgets.tasksToday.link,
            icon: ClipboardList,
            label: "Tareas de hoy",
            value: widgets.tasksToday.count,
            attention: widgets.tasksToday.count > 0 ? "warning" : undefined,
          },
          {
            href: widgets.pendingPayments.link,
            icon: CreditCard,
            label: "Pagos pendientes",
            value: widgets.pendingPayments.count,
            hint: formatMoney(widgets.pendingPayments.totalAmount),
            attention: widgets.pendingPayments.count > 0 ? "warning" : undefined,
          },
        ]}
      />

      <section className="space-y-3" aria-labelledby="credit-attention-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2
              id="credit-attention-heading"
              className="text-base font-semibold text-ink"
            >
              Atención crédito
            </h2>
            <p className="text-sm text-text-secondary">
              Prioridades operativas del pipeline crediticio.
            </p>
          </div>
          <Link
            href="/crm/casos"
            className="shrink-0 text-[13px] font-medium text-action-primary hover:text-action-secondary"
          >
            Ver casos →
          </Link>
        </div>
        <KpiStrip
          items={[
            {
              href: widgets.documentsPendingCases.link,
              icon: FileText,
              label: "Docs pendientes",
              value: widgets.documentsPendingCases.count,
              attention:
                widgets.documentsPendingCases.count > 0 ? "warning" : undefined,
            },
            {
              href: widgets.reportsToReview.link,
              icon: ClipboardList,
              label: "Reportes a revisar",
              value: widgets.reportsToReview.count,
              hint: "UPDATE · 14 días",
              attention:
                widgets.reportsToReview.count > 0 ? "warning" : undefined,
            },
            {
              href: widgets.roundsToPrepare.link,
              icon: RefreshCcw,
              label: "Rondas por preparar",
              value: widgets.roundsToPrepare.count,
            },
            {
              href: widgets.roundsWaitingUpdate.link,
              icon: CalendarClock,
              label: "Esperando update",
              value: widgets.roundsWaitingUpdate.count,
            },
            {
              href: widgets.overdueUpdates.link,
              icon: AlertTriangle,
              label: "Revisiones vencidas",
              value: widgets.overdueUpdates.count,
              attention:
                widgets.overdueUpdates.count > 0 ? "danger" : undefined,
            },
            {
              href: widgets.overduePayments.link,
              icon: CreditCard,
              label: "Pagos vencidos",
              value: widgets.overduePayments.count,
              attention:
                widgets.overduePayments.count > 0 ? "danger" : undefined,
            },
          ]}
        />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-surface bg-border-subtle sm:grid-cols-3 lg:grid-cols-5">
          {[
            {
              href: widgets.newLeads.link,
              icon: Users,
              label: "Leads 7d",
              value: widgets.newLeads.count,
            },
            {
              href: widgets.conversions.link,
              icon: TrendingUp,
              label: "Ganadas 30d",
              value: widgets.conversions.count,
            },
            {
              href: widgets.disputedItems.link,
              icon: Scale,
              label: "Ítems en disputa",
              value: widgets.disputedItems.count,
            },
            {
              href: widgets.deletedItems.link,
              icon: Scale,
              label: "Eliminados",
              value: widgets.deletedItems.count,
            },
            {
              href: widgets.updatedItems.link,
              icon: Scale,
              label: "Actualizados",
              value: widgets.updatedItems.count,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 bg-surface-elevated px-4 py-3 transition-colors hover:bg-nav-hover"
              >
                <span className="flex size-7 items-center justify-center rounded-control bg-nav-active text-action-primary">
                  <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-semibold tabular-nums text-ink">
                    {item.value}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    {item.label}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revisiones próximas: casos y rondas con fecha */}
        <Card>
          <CardHeader
            title="Revisiones próximas"
            description="Casos y rondas con fecha de revisión en los próximos 14 días o vencidas."
            actions={
              <Link
                href="/crm/rondas"
                className="text-[13px] font-medium text-action-primary hover:text-action-secondary"
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
                className="text-[13px] font-medium text-action-primary hover:text-action-secondary"
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
                className="text-[13px] font-medium text-action-primary hover:text-action-secondary"
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
                className="text-[13px] font-medium text-action-primary hover:text-action-secondary"
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
