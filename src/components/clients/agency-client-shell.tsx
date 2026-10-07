import Link from "next/link";
import type { ReactNode } from "react";
import type { ClientStatus } from "@prisma/client";
import { FondifyStatusCapsule } from "@/src/components/agency/capsule";

/**
 * Chrome Fondify para subrutas del cliente (sin Tabs del ClientHeader antiguo).
 */
export function AgencyClientShell({
  clientId,
  fullName,
  status,
  title,
  actions,
  meta,
  children,
}: {
  clientId: string;
  fullName: string;
  status: ClientStatus;
  title?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-surface bg-surface-panel p-4">
        <Link
          href={`/crm/clientes/${clientId}`}
          className="text-[13px] font-medium text-action-primary"
        >
          ← Resumen
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">
                {fullName}
              </h1>
              <FondifyStatusCapsule status={status} />
            </div>
            {title ? (
              <p className="mt-1 text-[13px] font-medium text-text-secondary">
                {title}
              </p>
            ) : null}
            {meta ? <div className="mt-2">{meta}</div> : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
