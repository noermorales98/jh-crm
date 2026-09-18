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
    const exact = pathname === item.href;
    const hasTabChild = items.some(
      (other) =>
        other.href !== item.href && other.href.startsWith(`${item.href}/`),
    );
    // El índice (p. ej. Resumen) solo coincide exacto; si no, hijos no-tab
    // como /expediente marcarían Resumen por error.
    const prefix =
      !hasTabChild && pathname.startsWith(`${item.href}/`);
    if ((exact || prefix) && item.href.length > bestLen) {
      activeHref = item.href;
      bestLen = item.href.length;
    }
  }

  return (
    <nav aria-label="Secciones" className="mb-6">
      <div className="flex gap-1 overflow-x-auto p-0.5">
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              data-cuelume-hover="tick"
              className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-[color,background-color,box-shadow] duration-200 motion-reduce:transition-none ${
                active
                  ? "bg-surface-elevated font-semibold text-ink"
                  : "font-medium text-text-secondary hover:bg-nav-hover hover:text-ink"
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
