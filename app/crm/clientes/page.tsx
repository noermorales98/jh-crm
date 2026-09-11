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
  ListToolbar,
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
import {
  CLIENT_STATUS_LABELS,
  LEAD_CHANNEL_LABELS,
  labelFor,
} from "@/src/lib/labels";

export const metadata: Metadata = {
  title: "Clientes",
};

const CLIENT_STATUSES = Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[];

function originLabel(source: string | null, leadChannel: string | null) {
  const channel = leadChannel
    ? labelFor(LEAD_CHANNEL_LABELS, leadChannel)
    : null;
  if (channel && source) return `${channel} · ${source}`;
  if (channel) return channel;
  if (source) return source;
  return null;
}

function nextActionKindLabel(kind: "service" | "follow_up" | "review") {
  switch (kind) {
    case "follow_up":
      return "Seguimiento";
    case "review":
      return "Revisión";
    default:
      return "Acción";
  }
}

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

  const now = Date.now();

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Cartera de clientes y prospectos. Origen, servicios activos y próxima acción."
        actions={
          can(ctx.role, "clients.create") ? (
            <ButtonLink href="/crm/clientes/nuevo">
              <Plus className="size-4" aria-hidden />
              Nuevo cliente
            </ButtonLink>
          ) : null
        }
      />

      <ListToolbar
        search={
          <SearchInput
            placeholder="Buscar por nombre, código, correo o teléfono…"
            defaultValue={q ?? ""}
          />
        }
        filters={
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
        }
      />

      <Card>
        {result.items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin clientes"
            description={
              q || status || assignedToId
                ? "Ningún cliente coincide con los filtros aplicados."
                : "Agrega el primer cliente para empezar."
            }
            action={
              can(ctx.role, "clients.create") &&
              !q &&
              !status &&
              !assignedToId ? (
                <ButtonLink href="/crm/clientes/nuevo" size="sm">
                  <Plus className="size-4" aria-hidden />
                  Agregar cliente
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Contacto</TH>
                <TH>Origen</TH>
                <TH>Responsable</TH>
                <TH>Servicios activos</TH>
                <TH>Próxima acción</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {result.items.map((client) => {
                const origin = originLabel(client.source, client.leadChannel);
                const next = client.nextAction;
                const overdue = next ? next.at.getTime() < now : false;

                return (
                  <TR
                    key={client.id}
                    className="transition-colors hover:bg-nav-hover"
                  >
                    <TD>
                      <Link
                        href={`/crm/clientes/${client.id}`}
                        className="font-medium text-action-primary hover:text-action-secondary"
                      >
                        {clientFullName(client)}
                      </Link>
                      <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
                        {client.clientCode}
                      </p>
                    </TD>
                    <TD>
                      <div className="text-xs">
                        {client.email ? (
                          <span className="block text-text-secondary-strong">
                            {client.email}
                          </span>
                        ) : null}
                        {client.phone ? (
                          <span className="block text-text-secondary">
                            {client.phone}
                          </span>
                        ) : null}
                        {!client.email && !client.phone ? (
                          <span className="text-text-secondary">—</span>
                        ) : null}
                      </div>
                    </TD>
                    <TD className="max-w-[10rem]">
                      {origin ? (
                        <span className="line-clamp-2 text-xs text-text-secondary-strong">
                          {origin}
                        </span>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {client.assignedTo?.name ?? (
                        <span className="text-text-secondary">Sin asignar</span>
                      )}
                    </TD>
                    <TD>
                      {client.activeServices.length === 0 ? (
                        <span className="text-text-secondary">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {client.activeServices.slice(0, 3).map((svc) => (
                            <li key={`${svc.kind}-${svc.id}`} className="text-xs">
                              <span className="font-medium text-text-primary">
                                {svc.label}
                              </span>
                              <span className="block text-[11px] text-text-secondary">
                                {svc.caseNumber}
                                {svc.stageName ? ` · ${svc.stageName}` : ""}
                              </span>
                            </li>
                          ))}
                          {client.activeServices.length > 3 ? (
                            <li className="text-[11px] text-text-secondary">
                              +{client.activeServices.length - 3} más
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {next ? (
                        <div className="text-xs">
                          <span
                            className={
                              overdue
                                ? "font-medium tabular-nums text-danger"
                                : "tabular-nums text-text-secondary-strong"
                            }
                          >
                            {formatDate(next.at)}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-text-secondary">
                            {nextActionKindLabel(next.kind)}
                            {next.kind !== "follow_up"
                              ? ` · ${next.label}`
                              : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </TD>
                    <TD>
                      <StatusPill domain="client" value={client.status} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}

        <CursorPagination
          pathname="/crm/clientes"
          params={{
            q,
            status,
            assignedTo: assignedToId,
            back: firstParam(sp, "back"),
          }}
          cursor={cursor}
          nextCursor={result.nextCursor}
        />
      </Card>
    </div>
  );
}
