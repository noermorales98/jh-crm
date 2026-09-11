import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as paymentService from "@/src/server/payments";
import { DomainError } from "@/src/server/errors";
import { Card, CardBody, CardHeader, StatusPill } from "@/src/components/ui";
import { formatDate, formatMoney } from "@/src/lib/format";
import { labelFor, PAYMENT_METHOD_LABELS } from "@/src/lib/labels";
import { clientFullName, toDateInputValue } from "@/src/server/page-helpers";
import { PaymentRowActions } from "@/src/components/payments/payment-row-actions";

export async function PaymentDetailPanel({ paymentId }: { paymentId: string }) {
  const ctx = await requireOrganization();
  let payment: Awaited<ReturnType<typeof paymentService.getPaymentDetail>>;
  try {
    payment = await paymentService.getPaymentDetail(ctx, paymentId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const canRegister = can(ctx.role, "payments.register");

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold tabular-nums text-ink">
          {formatMoney(payment.amount, payment.currency)}
        </h2>
        <div className="mt-2">
          <StatusPill domain="payment" value={payment.status} />
        </div>
      </div>

      <Card>
        <CardHeader title="Detalle" />
        <CardBody>
          <dl className="space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Cliente</dt>
              <dd className="text-[13px] text-ink">
                <Link
                  href={`/crm/clientes?id=${payment.client.id}`}
                  className="text-action-primary hover:text-action-secondary"
                >
                  {clientFullName(payment.client)}
                </Link>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Método</dt>
              <dd className="text-[13px] text-ink">{labelFor(PAYMENT_METHOD_LABELS, payment.method)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Fecha</dt>
              <dd className="text-[13px] text-ink">
                {formatDate(
                  payment.receivedAt ?? payment.dueAt ?? payment.createdAt,
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Referencia</dt>
              <dd className="text-[13px] text-ink">{payment.reference ?? "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Caso</dt>
              <dd className="text-[13px] text-ink">
                {payment.case ? (
                  <Link
                    href={`/crm/casos?id=${payment.case.id}`}
                    className="text-action-primary hover:text-action-secondary"
                  >
                    {payment.case.caseCode}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Cotización</dt>
              <dd className="text-[13px] text-ink">
                {payment.quote ? (
                  <Link
                    href={`/crm/cotizaciones?id=${payment.quote.id}`}
                    className="font-mono text-action-primary hover:text-action-secondary"
                  >
                    {payment.quote.folio}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {payment.receipt ? (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[12px] text-text-secondary">Recibo</dt>
                <dd className="text-[13px] text-ink">
                  <a
                    href={`/api/receipts/${payment.receipt.id}/pdf`}
                    className="text-action-primary hover:text-action-secondary"
                  >
                    {payment.receipt.folio}
                  </a>
                </dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Registrado por</dt>
              <dd className="text-[13px] text-ink">{payment.createdBy?.name ?? "—"}</dd>
            </div>
          </dl>
          {payment.notes ? (
            <p className="mt-4 whitespace-pre-wrap text-sm text-text-secondary-strong">
              {payment.notes}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {canRegister ? (
        <PaymentRowActions
          payment={{
            id: payment.id,
            status: payment.status,
            amount: payment.amount.toString(),
            method: payment.method,
            reference: payment.reference ?? "",
            dueAt: toDateInputValue(payment.dueAt),
            notes: payment.notes ?? "",
          }}
        />
      ) : null}
    </div>
  );
}
