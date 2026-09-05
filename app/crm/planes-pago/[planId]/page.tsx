import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as paymentPlans from "@/src/server/payment-plans";
import {
  Card,
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
  PAYMENT_INSTALLMENT_STATUS_LABELS,
  PAYMENT_PLAN_FREQUENCY_LABELS,
  PAYMENT_PLAN_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/src/lib/labels";
import { CancelPlanButton } from "@/src/components/payment-plans/cancel-plan-button";

export const metadata: Metadata = {
  title: "Detalle del plan",
};

const PLAN_TONE: Record<string, "green" | "amber" | "slate" | "blue"> = {
  ACTIVE: "blue",
  COMPLETED: "green",
  CANCELLED: "slate",
  PAUSED: "amber",
};

const INST_TONE: Record<string, "green" | "amber" | "slate" | "red"> = {
  PENDING: "amber",
  PAID: "green",
  CANCELLED: "slate",
  OVERDUE: "red",
};

export default async function PaymentPlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const ctx = await requirePermission("payments.view");
  const canRegister = can(ctx.role, "payments.register");

  let plan;
  try {
    plan = await paymentPlans.getPaymentPlan(ctx, planId);
  } catch {
    notFound();
  }

  const clientName = [plan.client.firstName, plan.client.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <PageHeader
        title={`Plan · ${plan.client.clientCode}`}
        description={`${clientName} · ${formatMoney(plan.totalAmount)} en ${plan.numberOfInstallments} cuotas (${labelFor(PAYMENT_PLAN_FREQUENCY_LABELS, plan.frequency)})`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={PLAN_TONE[plan.status] ?? "slate"}>
              {labelFor(PAYMENT_PLAN_STATUS_LABELS, plan.status)}
            </Pill>
            {canRegister && plan.status === "ACTIVE" ? (
              <CancelPlanButton planId={plan.id} />
            ) : null}
          </div>
        }
      />

      <div className="mb-4 text-sm text-text-secondary">
        <Link href="/crm/planes-pago" className="hover:text-ink">
          ← Planes de pago
        </Link>
        {" · "}
        <Link
          href={`/crm/clientes/${plan.client.id}`}
          className="text-action-primary hover:underline"
        >
          Ver cliente
        </Link>
        {plan.case ? (
          <>
            {" · "}
            <Link
              href={`/crm/casos/${plan.case.id}`}
              className="text-action-primary hover:underline"
            >
              Caso {plan.case.caseCode}
            </Link>
          </>
        ) : null}
      </div>

      {plan.notes ? (
        <Card className="mb-6 p-4 text-sm text-text-secondary">{plan.notes}</Card>
      ) : null}

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Vence</TH>
              <TH>Monto</TH>
              <TH>Cuota</TH>
              <TH>Pago</TH>
            </TR>
          </THead>
          <TBody>
            {plan.installments.map((inst) => (
              <TR key={inst.id}>
                <TD className="tabular-nums">{inst.sequence}</TD>
                <TD>{formatDate(inst.dueAt)}</TD>
                <TD className="tabular-nums">{formatMoney(inst.amount)}</TD>
                <TD>
                  <Pill tone={INST_TONE[inst.status] ?? "slate"}>
                    {labelFor(PAYMENT_INSTALLMENT_STATUS_LABELS, inst.status)}
                  </Pill>
                </TD>
                <TD>
                  {inst.payment ? (
                    <Link
                      href={`/crm/pagos?clientId=${plan.clientId}`}
                      className="text-action-primary hover:underline"
                    >
                      {labelFor(PAYMENT_STATUS_LABELS, inst.payment.status)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
