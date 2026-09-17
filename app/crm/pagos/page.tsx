import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Plus } from "lucide-react";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as paymentService from "@/src/server/payments";
import * as clientService from "@/src/server/clients";
import {
  clientFullName,
  firstParam,
  parseDateParam,
  parseEnumParam,
  toDateInputValue,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  ButtonLink,
  Card,
  CardBody,
  CursorPagination,
  EmptyState,
  FilterBar,
  FilterDate,
  FilterSelect,
  ListToolbar,
  PageHeader,
  StatusPill,
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
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/src/lib/labels";
import { PaymentRowActions } from "@/src/components/payments/payment-row-actions";

export const metadata: Metadata = {
  title: "Cobrar",
};

const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];
const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;

  const status = parseEnumParam(firstParam(sp, "status"), PAYMENT_STATUSES);
  const method = parseEnumParam(firstParam(sp, "method"), PAYMENT_METHODS);
  const clientId = firstParam(sp, "clientId");
  const from = parseDateParam(firstParam(sp, "from"));
  const to = parseDateParam(firstParam(sp, "to"));
  const cursor = firstParam(sp, "cursor");
  const canRegister = can(ctx.role, "payments.register");

  const [result, pendingTotal, clients] = await Promise.all([
    paymentService.listPayments(ctx, { status, method, clientId, from, to, cursor }),
    paymentService.sumPendingPayments(ctx),
    clientService.listClients(ctx, { limit: 100 }),
  ]);

  const clientOptions = clients.items.map((c) => ({
    value: c.id,
    label: `${clientFullName(c)} (${c.clientCode})`,
  }));

  return (
    <div>
      <PageHeader
        title="Cobrar"
        description="Registra pagos recibidos o genera un link Stripe desde una cotización vinculada."
        actions={
          canRegister ? (
            <ButtonLink href="/crm/pagos/nuevo">
              <Plus className="size-4" aria-hidden />
              Registrar pago
            </ButtonLink>
          ) : null
        }
      />

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Pendiente por cobrar
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
              {formatMoney(pendingTotal)}
            </p>
          </div>
          <ButtonLink href="/crm/pagos?status=PENDING" variant="secondary" size="sm">
            Ver pendientes
          </ButtonLink>
        </CardBody>
      </Card>

      <ListToolbar
        filters={
          <FilterBar>
            <FilterSelect
              name="status"
              label="Estado"
              options={PAYMENT_STATUSES.map((s) => ({
                value: s,
                label: PAYMENT_STATUS_LABELS[s],
              }))}
            />
            <FilterSelect
              name="method"
              label="Método"
              options={PAYMENT_METHODS.map((m) => ({
                value: m,
                label: PAYMENT_METHOD_LABELS[m],
              }))}
            />
            <FilterSelect name="clientId" label="Cliente" options={clientOptions} />
            <FilterDate name="from" label="Desde" />
            <FilterDate name="to" label="Hasta" />
          </FilterBar>
        }
      />

      <Card>
        {result.items.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Sin pagos"
            description={
              status || method || clientId || from || to
                ? "Ningún pago coincide con los filtros aplicados."
                : "Cuando tengas algo por cobrar, aparecerá aquí."
            }
            action={
              canRegister && !status && !method && !clientId && !from && !to ? (
                <ButtonLink href="/crm/pagos/nuevo" size="sm">
                  <Plus className="size-4" aria-hidden />
                  Registrar pago
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Cliente</TH>
                <TH className="text-right">Monto</TH>
                <TH>Método</TH>
                <TH>Estado</TH>
                <TH>Referencia</TH>
                <TH>Cotización</TH>
                {canRegister ? <TH className="text-right">Acciones</TH> : null}
              </TR>
            </THead>
            <TBody>
              {result.items.map((payment) => (
                <TR key={payment.id} className="transition-colors hover:bg-nav-hover">
                  <TD className="whitespace-nowrap text-text-secondary">
                    {formatDate(
                      payment.receivedAt ?? payment.dueAt ?? payment.createdAt,
                    )}
                  </TD>
                  <TD>
                    <Link
                      href={`/crm/clientes/${payment.client.id}`}
                      className="font-medium text-action-primary hover:text-action-secondary"
                    >
                      {clientFullName(payment.client)}
                    </Link>
                    <span className="block text-xs text-text-secondary">
                      {payment.client.clientCode}
                      {payment.case ? ` · ${payment.case.caseCode}` : ""}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">
                    {formatMoney(payment.amount, payment.currency)}
                  </TD>
                  <TD>{labelFor(PAYMENT_METHOD_LABELS, payment.method)}</TD>
                  <TD>
                    <StatusPill domain="payment" value={payment.status} />
                  </TD>
                  <TD className="text-text-secondary">{payment.reference ?? "—"}</TD>
                  <TD className="whitespace-nowrap">
                    {payment.quote ? (
                      <Link
                        href={`/crm/cotizaciones/${payment.quote.id}`}
                        className="font-mono text-xs font-medium text-action-primary hover:text-action-secondary"
                      >
                        {payment.quote.folio}
                      </Link>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                    {payment.receipt ? (
                      <a
                        href={`/api/receipts/${payment.receipt.id}/pdf`}
                        className="block text-xs text-action-primary hover:text-action-secondary"
                      >
                        Recibo {payment.receipt.folio}
                      </a>
                    ) : null}
                  </TD>
                {canRegister ? (
                    <TD className="whitespace-nowrap text-right">
                      <PaymentRowActions
                        payment={{
                          id: payment.id,
                          status: payment.status,
                          amount: payment.amount.toString(),
                          method: payment.method,
                          reference: payment.reference ?? "",
                          dueAt: toDateInputValue(payment.dueAt),
                          notes: payment.notes ?? "",
                          quoteId: payment.quote?.id ?? null,
                          quoteStatus: payment.quote?.status ?? null,
                          clientPhone: payment.client.phone,
                        }}
                      />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <CursorPagination
          pathname="/crm/pagos"
          params={{
            status,
            method,
            clientId,
            from: firstParam(sp, "from"),
            to: firstParam(sp, "to"),
            back: firstParam(sp, "back"),
          }}
          cursor={cursor}
          nextCursor={result.nextCursor}
        />
      </Card>
    </div>
  );
}
