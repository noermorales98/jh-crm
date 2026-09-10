"use client";

import Link from "next/link";
import type { ActiveServiceView } from "@/src/server/clients/overview";

/**
 * Chips para cambiar el servicio/CreditCase activo vía ?caseId= (CL-003).
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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
        Servicios
      </span>
      {services.map((svc) => {
        const active = svc.creditCaseId === activeCaseId;
        const href =
          services.length === 1
            ? `/crm/clientes/${clientId}`
            : `/crm/clientes/${clientId}?caseId=${svc.creditCaseId}`;
        return (
          <Link
            key={svc.creditCaseId}
            href={href}
            className={
              active
                ? "rounded-full bg-action-primary px-2.5 py-0.5 text-xs font-medium text-white"
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
