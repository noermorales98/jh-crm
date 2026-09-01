import type { ReactNode } from "react";
import { PageHeader, StatusPill, Tabs } from "@/src/components/ui";
import { clientFullName } from "@/src/server/page-helpers";

export interface ClientHeaderData {
  id: string;
  clientCode: string;
  firstName: string;
  lastName: string | null;
  status: string;
}

/** Encabezado compartido de las páginas del cliente: título + estado + tabs. */
export function ClientHeader({
  client,
  actions,
}: {
  client: ClientHeaderData;
  actions?: ReactNode;
}) {
  const base = `/crm/clientes/${client.id}`;
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {clientFullName(client)}
            <StatusPill domain="client" value={client.status} />
          </span>
        }
        description={
          <span className="font-mono text-xs">{client.clientCode}</span>
        }
        actions={actions}
      />
      <Tabs
        items={[
          { href: base, label: "Resumen" },
          { href: `${base}/expediente`, label: "Expediente" },
          { href: `${base}/casos`, label: "Casos" },
          { href: `${base}/actividad`, label: "Actividad" },
        ]}
      />
    </>
  );
}
