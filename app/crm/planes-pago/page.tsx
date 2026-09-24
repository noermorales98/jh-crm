import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { prisma } from "@/src/lib/db";
import * as paymentPlans from "@/src/server/payment-plans";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import { ymdInZone } from "@/src/lib/format/dates";
import {
  Card,
  EmptyState,
  PageHeader,
  Pill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate, formatMoney } from "@/src/lib/format";
import {
  labelFor,
  PAYMENT_PLAN_FREQUENCY_LABELS,
  PAYMENT_PLAN_STATUS_LABELS,
} from "@/src/lib/labels";
import { CreatePlanButton } from "@/src/components/payment-plans/create-plan-button";

export const metadata: Metadata = {
  title: "Cuotas",
};

const STATUS_TONE: Record<string, "green" | "amber" | "slate" | "blue"> = {
  ACTIVE: "blue",
  COMPLETED: "green",
  CANCELLED: "slate",
  PAUSED: "amber",
};

export default async function PaymentPlansPage() {
  const ctx = await requirePermission("payments.view");
  const canRegister = can(ctx.role, "payments.register");
  const [{ items }, timezone] = await Promise.all([
    paymentPlans.listPaymentPlans(ctx, { limit: 50 }),
    getOrganizationTimezone(ctx.organizationId),
  ]);
  const defaultStartDate = ymdInZone(new Date(), timezone);

  const clients = canRegister
    ? await prisma.client.findMany({
        where: {
          organizationId: ctx.organizationId,
          archivedAt: null,
          status: { in: ["LEAD", "ACTIVE", "PAUSED"] },
        },
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 200,
      })
    : [];

  const clientOptions = clients.map((c) => ({
    id: c.id,
    label: `${c.clientCode} · ${[c.firstName, c.lastName].filter(Boolean).join(" ")}`,
  }));

  return (
    <div>
      <PageHeader
        title="Cuotas"
        description="Planes de pago en cuotas. Al registrar el cobro, la cuota queda pagada."
        actions={
          canRegister ? (
            <CreatePlanButton
              clients={clientOptions}
              defaultStartDate={defaultStartDate}
            />
          ) : null
        }
      />

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Sin cuotas todavía"
            description="Crea un plan para generar las cuotas y los pagos por cobrar."
            action={
              canRegister ? (
                <CreatePlanButton
                  clients={clientOptions}
                  defaultStartDate={defaultStartDate}
                />
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Cuotas</TH>
                <TH>Frecuencia</TH>
                <TH>Inicio</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((plan) => (
                <TR key={plan.id} className="transition-colors hover:bg-nav-hover">
                  <TD>
                    <Link
                      href={`/crm/planes-pago/${plan.id}`}
                      className="font-medium text-action-primary hover:underline"
                    >
                      {plan.client.clientCode} ·{" "}
                      {[plan.client.firstName, plan.client.lastName]
                        .filter(Boolean)
                        .join(" ")}
                    </Link>
                  </TD>
                  <TD className="text-right tabular-nums">{formatMoney(plan.totalAmount)}</TD>
                  <TD className="text-right tabular-nums">{plan.numberOfInstallments}</TD>
                  <TD>
                    {labelFor(PAYMENT_PLAN_FREQUENCY_LABELS, plan.frequency)}
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">{formatDate(plan.startDate)}</TD>
                  <TD>
                    <Pill tone={STATUS_TONE[plan.status] ?? "slate"}>
                      {labelFor(PAYMENT_PLAN_STATUS_LABELS, plan.status)}
                    </Pill>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
