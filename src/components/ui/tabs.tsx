"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tabs de navegación por rutas (subpáginas de cliente/caso).
 * Activa la pestaña cuyo href coincide exactamente o es el prefijo más
 * largo de la ruta actual (p. ej. /credito activa también /credito/reportes/…).
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

  let activeHref: string | null = null;
  let bestLen = -1;
  for (const item of items) {
    const match =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (match && item.href.length > bestLen) {
      activeHref = item.href;
      bestLen = item.href.length;
    }
  }

  return (
    <nav aria-label="Secciones" className="mb-6 border-b border-border-subtle">
      <div className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              data-cuelume-hover="tick"
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm min-h-11 inline-flex items-center transition-colors duration-200 motion-reduce:transition-none ${
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
