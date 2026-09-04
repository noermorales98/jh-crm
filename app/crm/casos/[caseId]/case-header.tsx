import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader, StatusPill, Tabs } from "@/src/components/ui";
import { clientFullName } from "@/src/server/page-helpers";

export interface CaseHeaderData {
  id: string;
  caseCode: string;
  state: string;
  client: {
    id: string;
    clientCode: string;
    firstName: string;
    lastName: string | null;
  };
}

/** Encabezado compartido de las páginas del caso: título + estado + tabs. */
export function CaseHeader({
  creditCase,
  actions,
}: {
  creditCase: CaseHeaderData;
  actions?: ReactNode;
}) {
  const base = `/crm/casos/${creditCase.id}`;
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{creditCase.caseCode}</span>
            <StatusPill domain="case" value={creditCase.state} />
          </span>
        }
        description={
          <>
            Cliente:{" "}
            <Link
              href={`/crm/clientes/${creditCase.client.id}`}
              className="font-medium text-action-primary hover:text-action-secondary"
            >
              {clientFullName(creditCase.client)} ({creditCase.client.clientCode})
            </Link>
          </>
        }
        actions={actions}
      />
      <Tabs
        items={[
          { href: base, label: "Resumen" },
          { href: `${base}/credito`, label: "Crédito" },
          { href: `${base}/rondas`, label: "Rondas" },
          { href: `${base}/documentos`, label: "Documentos" },
          { href: `${base}/tareas`, label: "Tareas" },
          { href: `${base}/cotizaciones`, label: "Cotizaciones" },
          { href: `${base}/pagos`, label: "Pagos" },
        ]}
      />
    </>
  );
}
