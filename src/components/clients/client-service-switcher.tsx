"use client";

import Link from "next/link";
import type { ActiveServiceView } from "@/src/server/clients/overview";

/**
 * Chips para cambiar el CreditCase activo vía ?caseId= (prepara ServiceCase).
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
          >
            {svc.label}
            {services.length > 1 ? (
              <span className="ml-1 font-mono opacity-80">{svc.caseCode}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
