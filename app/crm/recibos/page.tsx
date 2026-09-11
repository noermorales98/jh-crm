import type { Metadata } from "next";
import Link from "next/link";
import { Download, Receipt } from "lucide-react";
import type { ReceiptStatus } from "@prisma/client";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as receiptService from "@/src/server/receipts";
import * as clientService from "@/src/server/clients";
import {
  clientFullName,
  firstParam,
  parseDateParam,
  parseEnumParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  buttonClasses,
  Card,
  CursorPagination,
  EmptyState,
  FilterBar,
  FilterDate,
  FilterSelect,
  ListToolbar,
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
import { labelFor, PAYMENT_METHOD_LABELS } from "@/src/lib/labels";
import { VoidReceiptButton } from "@/src/components/receipts/void-receipt-button";

export const metadata: Metadata = {
  title: "Recibos",
};

const RECEIPT_STATUSES: ReceiptStatus[] = ["ISSUED", "VOID"];
const RECEIPT_STATUS_LABELS: Record<string, string> = {
  ISSUED: "Emitido",
  VOID: "Anulado",
};

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;

  const status = parseEnumParam(firstParam(sp, "status"), RECEIPT_STATUSES);
  const clientId = firstParam(sp, "clientId");
  const from = parseDateParam(firstParam(sp, "from"));
  const to = parseDateParam(firstParam(sp, "to"));
  const cursor = firstParam(sp, "cursor");
  const canVoid = can(ctx.role, "receipts.void");

  const [result, clients] = await Promise.all([
    receiptService.listReceipts(ctx, { status, clientId, from, to, cursor }),
    clientService.listClients(ctx, { limit: 100 }),
  ]);

  const clientOptions = clients.items.map((c) => ({
    value: c.id,
    label: `${clientFullName(c)} (${c.clientCode})`,
  }));

  return (
    <div>
      <PageHeader
        title="Recibos"
        description="Recibos emitidos por pagos recibidos. La anulación nunca borra el registro."
      />

      <ListToolbar
        filters={
          <FilterBar>
            <FilterSelect
              name="status"
              label="Estado"
              options={RECEIPT_STATUSES.map((s) => ({
                value: s,
                label: RECEIPT_STATUS_LABELS[s],
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
            icon={Receipt}
            title="Sin recibos"
            description={
              status || clientId || from || to
                ? "Ningún recibo coincide con los filtros aplicados."
                : "Los recibos se emiten automáticamente al registrar un pago recibido."
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Folio</TH>
                <TH>Cliente</TH>
                <TH className="text-right">Monto</TH>
                <TH>Método</TH>
                <TH>Emitido</TH>
                <TH>Estado</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {result.items.map((receipt) => (
                <TR key={receipt.id} className="transition-colors hover:bg-nav-hover">
                  <TD className="whitespace-nowrap font-mono text-xs font-medium text-ink">
                    {receipt.folio}
                  </TD>
                  <TD>
                    <Link
                      href={`/crm/clientes/${receipt.client.id}`}
                      className="font-medium text-action-primary hover:text-action-secondary"
                    >
                      {clientFullName(receipt.client)}
                    </Link>
                    <span className="block text-xs text-text-secondary">
                      {receipt.client.clientCode}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">
                    {formatMoney(receipt.amount, receipt.currency)}
                  </TD>
                  <TD>{labelFor(PAYMENT_METHOD_LABELS, receipt.paymentMethod)}</TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {formatDate(receipt.issuedAt)}
                  </TD>
                  <TD>
                    {receipt.status === "ISSUED" ? (
                      <Pill tone="green">Emitido</Pill>
                    ) : (
                      <span>
                        <Pill tone="red">Anulado</Pill>
                        {receipt.voidReason ? (
                          <span className="mt-1 block max-w-56 text-xs text-text-secondary">
                            {receipt.voidReason}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/api/receipts/${receipt.id}/pdf`}
                        className={buttonClasses("ghost", "sm")}
                        title="Descargar PDF"
                      >
                        <Download className="size-3.5" aria-hidden />
                        PDF
                      </a>
                      {canVoid && receipt.status === "ISSUED" ? (
                        <VoidReceiptButton
                          receiptId={receipt.id}
                          folio={receipt.folio}
                        />
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <CursorPagination
          pathname="/crm/recibos"
          params={{
            status,
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
