import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader, StatusPill, Tabs } from "@/src/components/ui";
import { clientFullName } from "@/src/server/page-helpers";
import { getCaseSectionVisibility } from "@/src/lib/case-section-visibility";

export interface CaseHeaderData {
  id: string;
  caseCode: string;
  state: string;
  stage?: { key?: string | null; name?: string | null } | null;
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
  const vis = getCaseSectionVisibility(
    creditCase.state,
    creditCase.stage?.key ?? null,
  );

  const items = [
    { href: base, label: "Resumen", show: vis.summary },
    { href: `${base}/credito`, label: "Crédito", show: vis.credito },
    { href: `${base}/rondas`, label: "Rondas", show: vis.rondas },
    { href: `${base}/documentos`, label: "Documentos", show: vis.documentos },
    { href: `${base}/tareas`, label: "Tareas", show: vis.tareas },
    {
      href: `${base}/cotizaciones`,
      label: "Cotizaciones",
      show: vis.cotizaciones,
    },
    { href: `${base}/pagos`, label: "Pagos", show: vis.pagos },
  ].filter((i) => i.show);

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
            {creditCase.stage?.name ? (
              <span className="text-text-secondary">
                {" "}
                · {creditCase.stage.name}
              </span>
            ) : null}
          </>
        }
        actions={actions}
      />
      <Tabs items={items.map(({ href, label }) => ({ href, label }))} />
    </>
  );
}
