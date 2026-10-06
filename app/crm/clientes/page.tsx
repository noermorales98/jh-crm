import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import {
  clientFullName,
  firstParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import { CursorPagination, EmptyState, SearchInput } from "@/src/components/ui";
import { ClientRowCard } from "@/src/components/agency/client-row";
import { FilterPills } from "@/src/components/agency/filter-pills";
import { ClientsActionBar } from "@/src/components/clients/clients-action-bar";
import { getOrganizationShareUrl } from "@/src/server/org-share";
import type { FondifyBucket } from "@/src/lib/fondify/status";

export const metadata: Metadata = {
  title: "Clientes",
};

function parseFondifyStatus(
  raw: string | undefined,
): FondifyBucket | undefined {
  if (raw === "repair" || raw === "struct" || raw === "ready") return raw;
  return undefined;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;

  const q = firstParam(sp, "q");
  const fondifyStatus = parseFondifyStatus(firstParam(sp, "status"));
  const cursor = firstParam(sp, "cursor");

  const [result, counts, shareUrl] = await Promise.all([
    clientService.listClients(ctx, {
      q,
      fondifyStatus,
      cursor,
      limit: 40,
    }),
    clientService.countClientsByFondifyBucket(ctx, q),
    getOrganizationShareUrl(ctx),
  ]);

  const active: FondifyBucket | "all" = fondifyStatus ?? "all";
  const visibleCount = fondifyStatus ? counts[fondifyStatus] : counts.all;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            {visibleCount} CLIENTES
          </p>
          <h1 className="mt-1 text-[22px] font-bold leading-[1.2] tracking-[-0.02em] text-ink">
            Clientes
          </h1>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-text-secondary">
            Toca un cliente para ver su caso y cerrar la venta.
          </p>
        </div>
        <ClientsActionBar
          canCreate={can(ctx.role, "clients.create")}
          shareUrl={shareUrl}
        />
      </div>

      <div className="space-y-3">
        <div className="w-full max-w-md">
          <SearchInput
            placeholder="Buscar por nombre o correo…"
            defaultValue={q ?? ""}
          />
        </div>
        <FilterPills active={active} counts={counts} q={q} />
      </div>

      {result.items.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-panel px-4 py-10">
          <EmptyState
            icon={Users}
            title={
              q || fondifyStatus
                ? "Ningún cliente coincide con el filtro."
                : "Sin clientes"
            }
            description={
              q || fondifyStatus
                ? "Prueba otro filtro o limpia la búsqueda."
                : "Agrega el primer cliente para empezar."
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          {result.items.map((client) => (
            <ClientRowCard
              key={client.id}
              id={client.id}
              name={clientFullName(client)}
              email={client.email}
              status={client.status}
              roundNumber={client.roundNumber}
              nextActionAt={client.nextAction?.at ?? null}
              reportsCount={client.reportsCount}
            />
          ))}
        </div>
      )}

      <CursorPagination
        pathname="/crm/clientes"
        params={{
          q,
          status: fondifyStatus,
        }}
        cursor={cursor}
        nextCursor={result.nextCursor}
      />
    </div>
  );
}
