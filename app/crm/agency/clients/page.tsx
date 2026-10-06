import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import {
  clientFullName,
  firstParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import { FondifyLayout, FondifyStatusPill, FondifyRoundPill } from "@/src/components/fondify";
import { formatDate } from "@/src/lib/format";
import type { ClientStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "Clientes · Fondify Agency",
};

export default async function AgencyClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();
  const sp = await searchParams;

  const q = firstParam(sp, "q");
  const statusFilter = firstParam(sp, "status") as ClientStatus | null;

  const result = await clientService.listClients(ctx, {
    q,
    status: statusFilter ?? undefined,
    cursor: firstParam(sp, "cursor"),
  });

  const filterCounts = {
    ALL: result.items.length,
    ACTIVE: result.items.filter((c) => c.status === "ACTIVE").length,
    PAUSED: result.items.filter((c) => c.status === "PAUSED").length,
    LEAD: result.items.filter((c) => c.status === "LEAD").length,
  };

  return (
    <FondifyLayout>
      <div className="mx-auto max-w-[var(--ff-content-max)] space-y-6">
        {/* Page Header */}
        <header className="space-y-3">
          <div className="ff-kicker">{result.items.length} CLIENTES</div>
          <h1 className="ff-page-title">Clientes</h1>
          <p className="ff-page-subtitle">
            Toca un cliente para ver su caso y cerrar la venta.
          </p>
        </header>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {can(ctx.role, "clients.create") && (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-[var(--ff-radius-md)] border border-[var(--ff-primary)] px-4 py-2.5 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-primary)] transition-colors hover:bg-[var(--ff-primary-soft)]"
              >
                Comparte tu enlace
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] px-4 py-2.5 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text-secondary)] transition-colors hover:bg-[var(--ff-bg-soft)]"
              >
                Importar clientes
              </button>
              <Link
                href="/crm/agency/clients/new"
                className="ml-auto inline-flex items-center gap-2 rounded-[var(--ff-radius-md)] bg-[var(--ff-primary)] px-4 py-2.5 text-[var(--ff-fs-sm)] font-medium text-white transition-colors hover:bg-[var(--ff-primary-hover)]"
              >
                <Plus className="size-4" strokeWidth={2} />
                Agregar cliente
              </Link>
            </>
          )}
        </div>

        {/* Search + Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-[var(--ff-text-muted)]" strokeWidth={1.75} />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Buscar por nombre o correo…"
              className="w-full rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] bg-[var(--ff-surface)] py-2.5 pl-10 pr-4 text-[var(--ff-fs-sm)] text-[var(--ff-text)] placeholder:text-[var(--ff-text-muted)] focus:border-[var(--ff-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ff-primary)]/20"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: "ALL", label: "TODOS", count: filterCounts.ALL },
              { key: "ACTIVE", label: "ACTIVOS", count: filterCounts.ACTIVE },
              { key: "PAUSED", label: "PAUSADOS", count: filterCounts.PAUSED },
              { key: "LEAD", label: "PROSPECTOS", count: filterCounts.LEAD },
            ].map((filter) => {
              const isActive = !statusFilter && filter.key === "ALL" || statusFilter === filter.key;
              return (
                <Link
                  key={filter.key}
                  href={filter.key === "ALL" ? "/crm/agency/clients" : `/crm/agency/clients?status=${filter.key}`}
                  className={`inline-flex items-center gap-2 rounded-[var(--ff-radius-full)] px-4 py-2 text-[var(--ff-fs-xs)] font-semibold uppercase tracking-wide transition-colors ${
                    isActive
                      ? "border-2 border-[var(--ff-primary)] bg-[var(--ff-primary-soft)] text-[var(--ff-primary)]"
                      : "border border-[var(--ff-border)] bg-[var(--ff-surface)] text-[var(--ff-text-secondary)] hover:bg-[var(--ff-bg-soft)]"
                  }`}
                >
                  {filter.label} · {filter.count}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Clients List */}
        <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] shadow-[var(--ff-shadow-sm)] ring-1 ring-[var(--ff-border)]">
          {result.items.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-[var(--ff-text-muted)]">
                {q || statusFilter
                  ? "Ningún cliente coincide con el filtro."
                  : "Aún no hay clientes. Agrega el primero para empezar."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--ff-border)]">
              {result.items.map((client, index) => {
                const next = client.nextAction;

                return (
                  <Link
                    key={client.id}
                    href={`/crm/agency/clients/${client.id}`}
                    className={`flex min-h-[72px] items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--ff-primary-tint)] ${
                      index === 0 ? "rounded-t-[var(--ff-radius-lg)]" : ""
                    } ${index === result.items.length - 1 ? "rounded-b-[var(--ff-radius-lg)]" : ""}`}
                  >
                    <div className="flex-1">
                      <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[var(--ff-text)]">
                          {clientFullName(client)}
                        </span>
                        <FondifyStatusPill status={client.status} />
                        {client.activeServices.length > 0 && (
                          <FondifyRoundPill roundNumber={1} />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[var(--ff-fs-sm)] text-[var(--ff-text-secondary)]">
                        {client.email && <span>{client.email}</span>}
                        {next && (
                          <span className="text-[var(--ff-orange-review)]">
                            Revisar en {formatDate(next.at)}
                          </span>
                        )}
                        {client.activeServices.length > 0 && (
                          <span>REPORTES {client.activeServices.length}</span>
                        )}
                      </div>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5 shrink-0 text-[var(--ff-text-muted)]">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </FondifyLayout>
  );
}
