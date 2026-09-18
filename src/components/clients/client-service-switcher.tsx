"use client";

import Link from "next/link";
import type { ActiveServiceView } from "@/src/server/clients/overview";

/**
 * Chips para cambiar el servicio activo vía ?caseId= (creditCaseId o serviceCaseId).
 */
export function ClientServiceSwitcher({
  clientId,
  services,
  activeCaseId,
}: {
  clientId: string;
  services: ActiveServiceView[];
  activeCaseId: string | null;
}) {
  if (services.length === 0) return null;

  function switchKey(svc: ActiveServiceView) {
    return svc.creditCaseId ?? svc.serviceCaseId;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
        Servicios
      </span>
      {services.map((svc) => {
        const key = switchKey(svc);
        const active = key === activeCaseId;
        const href =
          services.length === 1
            ? `/crm/clientes/${clientId}`
            : `/crm/clientes/${clientId}?caseId=${key}`;
        return (
          <Link
            key={key}
            href={href}
            className={
              active
                ? "rounded-full bg-action-primary px-2.5 py-0.5 text-xs font-medium text-action-primary-foreground"
                : "rounded-full border border-border-subtle bg-surface-panel px-2.5 py-0.5 text-xs font-medium text-text-secondary transition-colors hover:bg-nav-hover hover:text-ink"
            }
            title={svc.stage?.name ?? undefined}
          >
            {svc.label}
            {services.length > 1 ? (
              <span className="ml-1 font-mono opacity-80">{svc.caseCode}</span>
            ) : null}
            {services.length > 1 && svc.stage?.name ? (
              <span className="ml-1 opacity-70">· {svc.stage.name}</span>
            ) : null}
          </Link>
        );
      })}
      {services.length > 1 ? (
        <Link
          href={`/crm/clientes/${clientId}/servicios`}
          className="text-[11px] font-medium text-action-primary hover:text-action-secondary"
        >
          Ver todos
        </Link>
      ) : null}
    </div>
  );
}
