import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { prisma } from "@/src/lib/db";
import * as paymentPlans from "@/src/server/payment-plans";
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
  title: "Planes de pago",
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
  const { items } = await paymentPlans.listPaymentPlans(ctx, { limit: 50 });

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
        title="Planes de pago"
        description="Cuotas periódicas con pagos pendientes vinculados. Al registrar el cobro, la cuota pasa a pagada."
        actions={
          canRegister ? <CreatePlanButton clients={clientOptions} /> : null
        }
      />

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Sin planes de pago"
            description="Crea un plan para generar cuotas y pagos pendientes automáticamente."
            action={
              canRegister ? (
                <CreatePlanButton clients={clientOptions} />
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Total</TH>
                <TH>Cuotas</TH>
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
                  <TD className="tabular-nums">{formatMoney(plan.totalAmount)}</TD>
                  <TD className="tabular-nums">{plan.numberOfInstallments}</TD>
                  <TD>
                    {labelFor(PAYMENT_PLAN_FREQUENCY_LABELS, plan.frequency)}
                  </TD>
                  <TD>{formatDate(plan.startDate)}</TD>
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
