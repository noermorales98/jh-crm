import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/src/lib/db";
import { Tabs } from "@/src/components/ui";
import { clientFullName } from "@/src/server/page-helpers";
import { clientTabs } from "@/src/lib/routes/client-tabs";
import { ServiceSwitcher } from "@/src/components/cases/service-switcher";

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

/**
 * Cabecera de las vistas de un servicio: es la ficha del cliente (mismas
 * pestañas) con el servicio activo y un selector si tiene varios.
 */
export async function CaseHeader({
  creditCase,
  actions,
}: {
  creditCase: CaseHeaderData;
  actions?: ReactNode;
}) {
  const clientId = creditCase.client.id;
  const cases = await prisma.creditCase.findMany({
    where: { clientId },
    orderBy: [{ openedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      caseCode: true,
      state: true,
      serviceCase: { select: { service: { select: { name: true } } } },
    },
  });
  const current = cases.find((c) => c.id === creditCase.id);
  const serviceName = current?.serviceCase?.service?.name ?? null;

  return (
    <div className="mb-4 space-y-3 rounded-surface bg-surface-panel p-4">
      <Link
        href={`/crm/clientes/${clientId}`}
        className="text-[13px] font-medium text-action-primary"
      >
        ← Resumen
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">
            {clientFullName(creditCase.client)}
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            {serviceName ?? "Servicio de crédito"}
            {creditCase.stage?.name ? ` · ${creditCase.stage.name}` : ""}
          </p>
          {cases.length > 1 ? (
            <div className="mt-2">
              <ServiceSwitcher
                clientId={clientId}
                currentId={creditCase.id}
                options={cases.map((c) => ({
                  id: c.id,
                  label: c.serviceCase?.service?.name ?? c.caseCode,
                  open: c.state === "OPEN",
                }))}
              />
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <Tabs items={clientTabs(clientId)} />
    </div>
  );
}
