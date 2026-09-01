import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import type { ClientStatus } from "@prisma/client";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import {
  clientFullName,
  firstParam,
  listMemberOptions,
  parseEnumParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  ButtonLink,
  Card,
  CursorPagination,
  EmptyState,
  FilterBar,
  FilterSelect,
  PageHeader,
  SearchInput,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { CLIENT_STATUS_LABELS } from "@/src/lib/labels";

export const metadata: Metadata = {
  title: "Clientes",
};

const CLIENT_STATUSES = Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;

  const q = firstParam(sp, "q");
  const status = parseEnumParam(firstParam(sp, "status"), CLIENT_STATUSES);
  const assignedToId = firstParam(sp, "assignedTo");
  const cursor = firstParam(sp, "cursor");

  const [result, members] = await Promise.all([
    clientService.listClients(ctx, { q, status, assignedToId, cursor }),
    listMemberOptions(ctx),
  ]);

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Cartera de clientes y prospectos de reparación de crédito."
        actions={
          can(ctx.role, "clients.create") ? (
            <ButtonLink href="/crm/clientes/nuevo">
              <Plus className="size-4" aria-hidden />
              Nuevo cliente
            </ButtonLink>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <SearchInput placeholder="Buscar por nombre, código, correo o teléfono…" defaultValue={q ?? ""} />
          <FilterBar>
            <FilterSelect
              name="status"
              label="Estado"
              options={CLIENT_STATUSES.map((s) => ({
                value: s,
                label: CLIENT_STATUS_LABELS[s],
              }))}
            />
            <FilterSelect
              name="assignedTo"
              label="Responsable"
              options={members.map((m) => ({ value: m.id, label: m.name }))}
            />
          </FilterBar>
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin clientes"
            description={
              q || status || assignedToId
                ? "Ningún cliente coincide con los filtros aplicados."
                : "Crea el primer cliente para empezar a operar."
            }
            action={
              can(ctx.role, "clients.create") && !q && !status && !assignedToId ? (
                <ButtonLink href="/crm/clientes/nuevo" size="sm">
                  <Plus className="size-4" aria-hidden />
                  Nuevo cliente
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Código</TH>
                <TH>Nombre</TH>
                <TH>Contacto</TH>
                <TH>Estado</TH>
                <TH>Responsable</TH>
                <TH>Alta</TH>
              </TR>
            </THead>
            <TBody>
              {result.items.map((client) => (
                <TR key={client.id} className="transition-colors hover:bg-nav-hover">
                  <TD className="whitespace-nowrap font-mono text-xs text-text-secondary">
                    {client.clientCode}
                  </TD>
                  <TD>
                    <Link
                      href={`/crm/clientes/${client.id}`}
                      className="font-medium text-action-primary hover:text-action-secondary"
                    >
                      {clientFullName(client)}
                    </Link>
                  </TD>
                  <TD>
                    <div className="text-xs">
                      {client.email ? (
                        <span className="block text-text-secondary-strong">{client.email}</span>
                      ) : null}
                      {client.phone ? (
                        <span className="block text-text-secondary">{client.phone}</span>
                      ) : null}
                      {!client.email && !client.phone ? (
                        <span className="text-text-secondary">—</span>
                      ) : null}
                    </div>
                  </TD>
                  <TD>
                    <StatusPill domain="client" value={client.status} />
                  </TD>
                  <TD className="whitespace-nowrap">
                    {client.assignedTo?.name ?? (
                      <span className="text-text-secondary">Sin asignar</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {formatDate(client.createdAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <CursorPagination
          pathname="/crm/clientes"
          params={{ q, status, assignedTo: assignedToId, back: firstParam(sp, "back") }}
          cursor={cursor}
          nextCursor={result.nextCursor}
        />
      </Card>
    </div>
  );
}
