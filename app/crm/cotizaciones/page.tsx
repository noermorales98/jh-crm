import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import type { QuoteStatus } from "@prisma/client";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as quoteService from "@/src/server/quotes";
import * as clientService from "@/src/server/clients";
import {
  clientFullName,
  firstParam,
  parseDateParam,
  parseEnumParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  ButtonLink,
  Card,
  CursorPagination,
  EmptyState,
  FilterBar,
  FilterDate,
  FilterSelect,
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
import { QUOTE_STATUS_LABELS } from "@/src/lib/labels";

export const metadata: Metadata = {
  title: "Cotizaciones",
};

const QUOTE_STATUSES = Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;

  const status = parseEnumParam(firstParam(sp, "status"), QUOTE_STATUSES);
  const clientId = firstParam(sp, "clientId");
  const from = parseDateParam(firstParam(sp, "from"));
  const to = parseDateParam(firstParam(sp, "to"));
  const cursor = firstParam(sp, "cursor");
  const canManage = can(ctx.role, "quotes.manage");

  const [result, clients] = await Promise.all([
    quoteService.listQuotes(ctx, { status, clientId, from, to, cursor }),
    clientService.listClients(ctx, { limit: 100 }),
  ]);

  const clientOptions = clients.items.map((c) => ({
    value: c.id,
    label: `${clientFullName(c)} (${c.clientCode})`,
  }));

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        description="Propuestas de precio enviadas a clientes, con seguimiento de estado y saldo."
        actions={
          canManage ? (
            <ButtonLink href="/crm/cotizaciones/nueva">
              <Plus className="size-4" aria-hidden />
              Nueva cotización
            </ButtonLink>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-border-subtle px-4 py-3">
          <FilterBar>
            <FilterSelect
              name="status"
              label="Estado"
              options={QUOTE_STATUSES.map((s) => ({
                value: s,
                label: QUOTE_STATUS_LABELS[s],
              }))}
            />
            <FilterSelect name="clientId" label="Cliente" options={clientOptions} />
            <FilterDate name="from" label="Emitida desde" />
            <FilterDate name="to" label="Emitida hasta" />
          </FilterBar>
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Sin cotizaciones"
            description={
              status || clientId || from || to
                ? "Ninguna cotización coincide con los filtros aplicados."
                : "Crea la primera cotización para un cliente."
            }
            action={
              canManage && !status && !clientId && !from && !to ? (
                <ButtonLink href="/crm/cotizaciones/nueva" size="sm">
                  <Plus className="size-4" aria-hidden />
                  Nueva cotización
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Folio</TH>
                <TH>Cliente</TH>
                <TH>Total</TH>
                <TH>Estado</TH>
                <TH>Emitida</TH>
                <TH>Válida hasta</TH>
              </TR>
            </THead>
            <TBody>
              {result.items.map((quote) => (
                <TR key={quote.id} className="transition-colors hover:bg-nav-hover">
                  <TD className="whitespace-nowrap font-mono text-xs">
                    <Link
                      href={`/crm/cotizaciones/${quote.id}`}
                      className="font-medium text-action-primary hover:text-action-secondary"
                    >
                      {quote.folio}
                    </Link>
                  </TD>
                  <TD>
                    <Link
                      href={`/crm/clientes/${quote.client.id}`}
                      className="font-medium text-action-primary hover:text-action-secondary"
                    >
                      {clientFullName(quote.client)}
                    </Link>
                    <span className="block text-xs text-text-secondary">
                      {quote.client.clientCode}
                      {quote.case ? ` · ${quote.case.caseCode}` : ""}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap tabular-nums">
                    {formatMoney(quote.total, quote.currency)}
                  </TD>
                  <TD>
                    <StatusPill domain="quote" value={quote.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {formatDate(quote.issuedAt)}
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {quote.validUntil ? formatDate(quote.validUntil) : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <CursorPagination
          pathname="/crm/cotizaciones"
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
