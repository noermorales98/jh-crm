import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, ClipboardList, CreditCard, Mail, MapPin, Phone } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import { listMemberOptions } from "@/src/server/page-helpers";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  StagePill,
  StatusPill,
} from "@/src/components/ui";
import { formatDate, formatMoney } from "@/src/lib/format";
import { DomainError } from "@/src/server/errors";
import { ClientActions } from "@/src/components/clients/client-actions";
import { ClientHeader } from "./client-header";

export const metadata: Metadata = {
  title: "Cliente",
};

function DataItem({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink">{value ?? "—"}</dd>
    </div>
  );
}

export default async function ClientSummaryPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client, cases, openTasks, recentPayments } = detail;
  const canEdit = can(ctx.role, "clients.edit");
  const members = canEdit ? await listMemberOptions(ctx) : [];

  const openCases = cases.filter((c) => c.state === "OPEN");
  const pendingPayments = recentPayments.filter((p) => p.status === "PENDING");
  const pendingTotal = pendingPayments.reduce(
    (acc, p) => acc + Number(p.amount.toString()),
    0,
  );

  const address = [
    client.addressLine1,
    client.addressLine2,
    [client.city, client.state].filter(Boolean).join(", "),
    client.postalCode,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <ClientHeader
        client={client}
        actions={
          canEdit ? (
            <ClientActions
              clientId={client.id}
              currentAssigneeId={client.assignedToId}
              isArchived={client.status === "ARCHIVED"}
              members={members}
            />
          ) : null
        }
      />

      {/* Stats accionables */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Link
          href={`/crm/clientes/${client.id}/casos`}
          className="rounded-surface bg-surface-elevated p-4 transition-colors hover:bg-nav-hover"
        >
          <div className="flex items-center gap-2 text-text-secondary">
            <Briefcase className="size-4" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide">Casos abiertos</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {openCases.length}
          </p>
        </Link>
        <div className="rounded-surface bg-surface-elevated p-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <ClipboardList className="size-4" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide">Tareas abiertas</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {openTasks.length}
          </p>
        </div>
        <Link
          href={`/crm/pagos?status=PENDING&clientId=${client.id}`}
          className="rounded-surface bg-surface-elevated p-4 transition-colors hover:bg-nav-hover"
        >
          <div className="flex items-center gap-2 text-text-secondary">
            <CreditCard className="size-4" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide">Pagos pendientes</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {formatMoney(pendingTotal)}
          </p>
          <p className="text-xs text-text-secondary">
            {pendingPayments.length} pago(s) por cobrar
          </p>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Datos principales" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DataItem label="Código" value={client.clientCode} />
              <DataItem
                label="Responsable"
                value={client.assignedTo?.name ?? "Sin asignar"}
              />
              <DataItem
                label="Correo"
                value={
                  client.email ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="size-3.5 text-text-secondary" aria-hidden />
                      {client.email}
                    </span>
                  ) : undefined
                }
              />
              <DataItem
                label="Teléfono"
                value={
                  client.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5 text-text-secondary" aria-hidden />
                      {client.phone}
                    </span>
                  ) : undefined
                }
              />
              <DataItem
                label="Dirección"
                value={
                  address ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-text-secondary" aria-hidden />
                      {address}
                    </span>
                  ) : undefined
                }
              />
              <DataItem label="Fuente" value={client.source ?? undefined} />
              <DataItem label="Cliente desde" value={formatDate(client.createdAt)} />
              <DataItem
                label="SSN"
                value={client.ssnMasked ?? "No registrado"}
              />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Casos recientes"
            actions={
              <Link
                href={`/crm/clientes/${client.id}/casos`}
                className="text-xs font-medium text-action-primary hover:text-action-secondary"
              >
                Ver todos →
              </Link>
            }
          />
          <CardBody className="p-0">
            {cases.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="Sin casos"
                description="Este cliente aún no tiene casos de reparación de crédito."
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {cases.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/crm/casos/${c.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-nav-hover"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {c.caseCode}
                        </p>
                        <p className="text-xs text-text-secondary">
                          Abierto {formatDate(c.openedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StagePill name={c.stage.name} color={c.stage.color} />
                        <StatusPill domain="case" value={c.state} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
