import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as quoteService from "@/src/server/quotes";
import * as paymentService from "@/src/server/payments";
import { DomainError } from "@/src/server/errors";
import { clientFullName } from "@/src/server/page-helpers";
import {
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Pill,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate, formatDateTime, formatMoney } from "@/src/lib/format";
import { labelFor, PAYMENT_METHOD_LABELS } from "@/src/lib/labels";
import { QuoteActions } from "@/src/components/quotes/quote-actions";

const QUOTE_EVENT_LABELS: Record<string, string> = {
  CREATED: "Creación",
  EDITED: "Edición",
  SENT: "Enviada",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  PAYMENT_RECORDED: "Pago registrado",
  PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada",
  EXPIRED: "Vencida",
  CANCELLED: "Cancelada",
  NOTE: "Nota",
};

export async function QuoteDetailPanel({ quoteId }: { quoteId: string }) {
  const ctx = await requireOrganization();

  let quote: Awaited<ReturnType<typeof quoteService.getQuoteDetail>>;
  try {
    quote = await quoteService.getQuoteDetail(ctx, quoteId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const [balance, payments] = await Promise.all([
    paymentService.quoteBalance(ctx, quoteId),
    paymentService.listPayments(ctx, { quoteId, limit: 50 }),
  ]);

  const canManage = can(ctx.role, "quotes.manage");
  const canRegisterPayment = can(ctx.role, "payments.register");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{quote.folio}</span>
            <StatusPill domain="quote" value={quote.status} />
          </span>
        }
        description={
          <>
            Cotización para{" "}
            <Link
              href={`/crm/clientes/${quote.client.id}`}
              className="font-medium text-action-primary hover:text-action-secondary"
            >
              {clientFullName(quote.client)}
            </Link>{" "}
            ({quote.client.clientCode})
            {quote.case ? (
              <>
                {" · Caso "}
                <Link
                  href={`/crm/casos/${quote.case.id}`}
                  className="font-medium text-action-primary hover:text-action-secondary"
                >
                  {quote.case.caseCode}
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          canManage || canRegisterPayment ? (
            <QuoteActions
              quoteId={quote.id}
              status={quote.status}
              clientId={quote.client.id}
            />
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Ítems" />
            <Table>
              <THead>
                <TR>
                  <TH>Descripción</TH>
                  <TH>Cant.</TH>
                  <TH>P. unitario</TH>
                  <TH>Descuento</TH>
                  <TH>Importe</TH>
                </TR>
              </THead>
              <TBody>
                {quote.items.map((item) => (
                  <TR key={item.id}>
                    <TD className="text-ink">{item.description}</TD>
                    <TD className="tabular-nums">{item.quantity.toString()}</TD>
                    <TD className="tabular-nums">
                      {formatMoney(item.unitPrice, quote.currency)}
                    </TD>
                    <TD className="tabular-nums">
                      {Number(item.discountAmount.toString()) > 0
                        ? `−${formatMoney(item.discountAmount, quote.currency)}`
                        : "—"}
                    </TD>
                    <TD className="tabular-nums">
                      {formatMoney(item.total, quote.currency)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex justify-end border-t border-border-subtle px-5 py-4">
              <dl className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Subtotal</dt>
                  <dd className="tabular-nums">
                    {formatMoney(quote.subtotal, quote.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Descuento</dt>
                  <dd className="tabular-nums">
                    −{formatMoney(quote.discountTotal, quote.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">
                    Impuesto ({quote.taxRate.toString()}%)
                  </dt>
                  <dd className="tabular-nums">
                    {formatMoney(quote.taxAmount, quote.currency)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border-subtle pt-1 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">
                    {formatMoney(quote.total, quote.currency)}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>

          {quote.notes || quote.terms ? (
            <Card>
              <CardHeader title="Notas y términos" />
              <CardBody className="space-y-4 text-sm">
                {quote.notes ? (
                  <div>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Notas
                    </h3>
                    <p className="whitespace-pre-wrap text-text-secondary-strong">{quote.notes}</p>
                  </div>
                ) : null}
                {quote.terms ? (
                  <div>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Términos
                    </h3>
                    <p className="whitespace-pre-wrap text-text-secondary-strong">{quote.terms}</p>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Pagos ligados"
              description="Pagos registrados contra esta cotización."
            />
            {payments.items.length === 0 ? (
              <p className="px-5 py-6 text-sm text-text-secondary">
                Aún no hay pagos registrados.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Monto</TH>
                    <TH>Método</TH>
                    <TH>Estado</TH>
                    <TH>Referencia</TH>
                  </TR>
                </THead>
                <TBody>
                  {payments.items.map((payment) => (
                    <TR key={payment.id}>
                      <TD className="whitespace-nowrap text-text-secondary">
                        {formatDate(payment.receivedAt ?? payment.dueAt ?? payment.createdAt)}
                      </TD>
                      <TD className="tabular-nums">
                        {formatMoney(payment.amount, payment.currency)}
                      </TD>
                      <TD>{labelFor(PAYMENT_METHOD_LABELS, payment.method)}</TD>
                      <TD>
                        <StatusPill domain="payment" value={payment.status} />
                      </TD>
                      <TD className="text-text-secondary">{payment.reference ?? "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Resumen" />
            <CardBody>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Emitida</dt>
                  <dd>{formatDate(quote.issuedAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Válida hasta</dt>
                  <dd>{quote.validUntil ? formatDate(quote.validUntil) : "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Creada por</dt>
                  <dd>{quote.createdBy?.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Correo del cliente</dt>
                  <dd>{quote.client.email ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Teléfono</dt>
                  <dd>{quote.client.phone ?? "—"}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Saldo" />
            <CardBody>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Total</dt>
                  <dd className="tabular-nums font-medium">
                    {formatMoney(balance.total, balance.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Recibido</dt>
                  <dd className="tabular-nums text-success-ink">
                    {formatMoney(balance.paid, balance.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Pendiente de recibir</dt>
                  <dd className="tabular-nums text-amber-700">
                    {formatMoney(balance.pending, balance.currency)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border-subtle pt-2 font-semibold">
                  <dt>Saldo</dt>
                  <dd className="tabular-nums">
                    {formatMoney(balance.balance, balance.currency)}
                  </dd>
                </div>
              </dl>
              {balance.balance.toString() === "0.00" ? (
                <div className="mt-3">
                  <Pill tone="green">Liquidada</Pill>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Historial" />
            <CardBody>
              {quote.events.length === 0 ? (
                <p className="text-sm text-text-secondary">Sin eventos.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-border-subtle pl-4">
                  {quote.events.map((event) => (
                    <li key={event.id}>
                      <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-brand-silver" />
                      <p className="text-sm font-medium text-ink">
                        {labelFor(QUOTE_EVENT_LABELS, event.type)}
                      </p>
                      {event.description ? (
                        <p className="text-xs text-text-secondary">{event.description}</p>
                      ) : null}
                      <p className="text-xs text-text-secondary">
                        {formatDateTime(event.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
