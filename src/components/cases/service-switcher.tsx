"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { caseHref } from "@/src/lib/routes/case-routes";

/** Pastillas para cambiar de servicio cuando el cliente tiene varios. */
export function ServiceSwitcher({
  clientId,
  currentId,
  options,
}: {
  clientId: string;
  currentId: string;
  options: { id: string; label: string; open: boolean }[];
}) {
  const pathname = usePathname();
  const onReports = pathname === `/crm/clientes/${clientId}/reportes`;
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Servicios del cliente">
      {options.map((option) => {
        const active = option.id === currentId;
        return (
          <Link
            key={option.id}
            role="tab"
            aria-selected={active}
            href={
              onReports
                ? `${pathname}?servicio=${option.id}`
                : caseHref(clientId, option.id)
            }
            className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              active
                ? "bg-nav-active text-action-primary"
                : "text-text-secondary ring-1 ring-border-subtle hover:bg-nav-hover"
            }`}
          >
            {option.label}
            {option.open ? "" : " · cerrado"}
          </Link>
        );
      })}
    </div>
  );
}
