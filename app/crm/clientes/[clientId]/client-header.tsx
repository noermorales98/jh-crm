import type { ReactNode } from "react";
import { Mail, Phone, User } from "lucide-react";
import { StatusPill, Tabs } from "@/src/components/ui";
import { clientFullName } from "@/src/server/page-helpers";

export interface ClientHeaderData {
  id: string;
  clientCode: string;
  firstName: string;
  lastName: string | null;
  status: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  leadChannel?: string | null;
  assignedTo?: { name: string | null } | null;
}

/** Encabezado denso compartido de las páginas del cliente. */
export function ClientHeader({
  client,
  actions,
  meta,
  below,
}: {
  client: ClientHeaderData;
  actions?: ReactNode;
  /** Fila extra (switcher de servicios, etc.). */
  meta?: ReactNode;
  below?: ReactNode;
}) {
  const base = `/crm/clientes/${client.id}`;
  const contactBits = [
    client.phone ? (
      <span key="phone" className="inline-flex items-center gap-1">
        <Phone className="size-3" aria-hidden />
        {client.phone}
      </span>
    ) : null,
    client.email ? (
      <span key="email" className="inline-flex items-center gap-1">
        <Mail className="size-3" aria-hidden />
        {client.email}
      </span>
    ) : null,
    client.assignedTo?.name ? (
      <span key="owner" className="inline-flex items-center gap-1">
        <User className="size-3" aria-hidden />
        {client.assignedTo.name}
      </span>
    ) : null,
    client.source || client.leadChannel ? (
      <span key="source">
        Origen: {client.source ?? client.leadChannel}
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink lg:text-[1.35rem]">
              {clientFullName(client)}
            </h1>
            <StatusPill domain="client" value={client.status} />
            <span className="font-mono text-[11px] text-text-secondary">
              {client.clientCode}
            </span>
          </div>
          {contactBits.length > 0 ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
              {contactBits}
            </p>
          ) : null}
          {meta ? <div className="mt-2">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {below}
      <div className="mt-2">
        <Tabs
          items={[
            { href: base, label: "Resumen" },
            { href: `${base}/expediente`, label: "Expediente" },
            { href: `${base}/casos`, label: "Casos" },
            { href: `${base}/actividad`, label: "Actividad" },
          ]}
        />
      </div>
    </div>
  );
}
