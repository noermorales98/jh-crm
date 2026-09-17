"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  ClipboardList,
  Ellipsis,
  Home,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  MoreNavPanel,
  isMoreNavPath,
} from "@/src/components/layout/more-nav-panel";

const BOTTOM_ITEMS: readonly {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: "exact" | "prefix";
}[] = [
  { href: "/crm/dashboard", label: "Inicio", icon: Home, match: "exact" },
  { href: "/crm/tareas", label: "Pendientes", icon: ClipboardList, match: "prefix" },
  { href: "/crm/clientes", label: "Clientes", icon: Users, match: "prefix" },
  { href: "/crm/casos", label: "Casos", icon: Briefcase, match: "prefix" },
];

function isActive(pathname: string, href: string, match: "exact" | "prefix") {
  if (match === "exact") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Barra inferior móvil del CRM (lg:hidden).
 * “Más” abre el mismo panel que el sidebar.
 */
export function CrmMobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = isMoreNavPath(pathname);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [moreOpen]);

  return (
    <>
      <nav
        aria-label="Navegación rápida"
        className="jh-mobile-bottom-nav fixed inset-x-0 bottom-0 z-sticky border-t border-border-subtle/80 bg-surface-panel/90 backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1">
          {BOTTOM_ITEMS.map(({ href, label, icon: Icon, match = "prefix" }) => {
            const active = isActive(pathname, href, match);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] px-1 py-1 text-[10px] font-medium tracking-[-0.01em] transition-colors ${
                  active
                    ? "text-action-primary"
                    : "text-text-secondary hover:text-ink"
                }`}
              >
                <Icon
                  className={`size-[22px] ${active ? "stroke-[2.25]" : ""}`}
                  aria-hidden
                />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-current={moreActive && !moreOpen ? "page" : undefined}
            onClick={() => setMoreOpen(true)}
            className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] px-1 py-1 text-[10px] font-medium tracking-[-0.01em] transition-colors ${
              moreActive || moreOpen
                ? "text-action-primary"
                : "text-text-secondary hover:text-ink"
            }`}
          >
            <Ellipsis
              className={`size-[22px] ${moreActive || moreOpen ? "stroke-[2.25]" : ""}`}
              aria-hidden
            />
            <span>Más</span>
          </button>
        </div>
      </nav>

      <MoreNavPanel
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        pathname={pathname}
      />
    </>
  );
}

