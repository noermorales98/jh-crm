"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tabs de navegación por rutas (subpáginas de cliente/caso).
 * La pestaña activa se detecta por pathname exacto.
 *
 * <Tabs items={[
 *   { href: `/crm/clientes/${id}`, label: "Resumen" },
 *   { href: `/crm/clientes/${id}/expediente`, label: "Expediente" },
 * ]} />
 */
export function Tabs({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones" className="mb-6 border-b border-border-subtle">
      <div className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors duration-200 motion-reduce:transition-none ${
                active
                  ? "border-action-primary font-semibold text-action-primary"
                  : "border-transparent font-medium text-text-secondary hover:border-border-subtle hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
