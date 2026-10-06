import type { Metadata } from "next";
import { Plus, Search } from "lucide-react";
import type { ClientStatus } from "@prisma/client";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import {
  clientFullName,
  firstParam,
  parseEnumParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  PageHeaderFondify,
  FilterPills,
  ClientRow,
  FondifyButton,
} from "@/src/components/fondify";
import { EmptyState } from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";

export const metadata: Metadata = {
  title: "Clientes",
};

const CLIENT_STATUS_LABELS = {
  LEAD: "PROSPECTOS",
  ACTIVE: "ACTIVOS",
  PAUSED: "PAUSADOS",
  COMPLETED: "COMPLETADOS",
  CANCELLED: "CANCELADOS",
  ARCHIVED: "ARCHIVADOS",
};

export default async function ClientsPageFondify({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;

  const q = firstParam(sp, "q");
  const status = parseEnumParam(firstParam(sp, "status"), Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]);
  const assignedToId = firstParam(sp, "assignedTo");
  const cursor = firstParam(sp, "cursor");

  const result = await clientService.listClients(ctx, {
    q,
    status,
    assignedToId,
    cursor,
  });

  const totalCount = result.items.length;
  const statusCounts: Record<string, number> = {
    "": totalCount,
    LEAD: 0,
    ACTIVE: 0,
    PAUSED: 0,
  };

  result.items.forEach((client) => {
    if (client.status in statusCounts) {
      statusCounts[client.status]++;
    }
  });

  const filterOptions = [
    { value: "", label: "TODOS", count: statusCounts[""] },
    { value: "ACTIVE", label: "ACTIVOS", count: statusCounts.ACTIVE },
    { value: "LEAD", label: "PROSPECTOS", count: statusCounts.LEAD },
    { value: "PAUSED", label: "PAUSADOS", count: statusCounts.PAUSED },
  ];

  const now = Date.now();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeaderFondify
        kicker={`${totalCount} CLIENTES`}
        title="Clientes"
        subtitle="Toca un cliente para ver su caso y cerrar la venta."
        actions={
          <>
            <FondifyButton variant="outlined" size="md">
              Comparte tu enlace
            </FondifyButton>
            <FondifyButton variant="outlined" size="md">
              Importar clientes
            </FondifyButton>
            {can(ctx.role, "clients.create") && (
              <FondifyButton
                href="/crm/clientes/nuevo"
                variant="primary"
                size="md"
                icon={Plus}
              >
                Agregar cliente
              </FondifyButton>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ff-text-muted)]" />
          <input
            type="search"
            name="q"
            placeholder="Buscar por nombre o correo…"
            defaultValue={q ?? ""}
            className="w-full rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] bg-[var(--ff-surface)] py-2 pl-10 pr-4 text-[var(--ff-fs-base)] text-[var(--ff-text)] placeholder:text-[var(--ff-text-muted)] focus:border-[var(--ff-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ff-primary)]/20"
          />
        </div>
        <FilterPills name="status" options={filterOptions} />
      </div>

      {result.items.length === 0 ? (
        <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-12 text-center">
          <EmptyState
            title="Sin clientes"
            description={
              q || status
                ? "Ningún cliente coincide con el filtro."
                : "Agrega el primer cliente para empezar."
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {result.items.map((client) => {
            const nextAction = client.nextAction;
            const overdue = nextAction ? nextAction.at.getTime() < now : false;
            const reviewDate = nextAction
              ? formatDate(nextAction.at)
              : undefined;

            return (
              <ClientRow
                key={client.id}
                id={client.id}
                name={clientFullName(client)}
                email={client.email ?? "Sin correo"}
                status={client.status}
                roundNumber={undefined}
                reviewDate={reviewDate}
                reportsCount={0}
                overdue={overdue}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
