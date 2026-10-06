"use client";

/**
 * Fondify Agency Sidebar — Navegación estilo Fondify
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  Briefcase,
  Target,
  CreditCard,
  Mail,
  Settings,
  Ellipsis,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  MoreNavPanel,
  isMoreNavPath,
} from "@/src/components/layout/more-nav-panel";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const PRIMARY_ITEMS: readonly NavItem[] = [
  { href: "/crm/dashboard", label: "Resumen", icon: Home },
  { href: "/crm/clientes", label: "Clientes", icon: Users },
  { href: "/crm/casos", label: "Casos", icon: Briefcase },
  { href: "/crm/tareas", label: "Pendientes", icon: Target },
  { href: "/crm/pagos", label: "Cobrar", icon: CreditCard },
  { href: "/crm/mails", label: "Mensajes", icon: Mail },
];

const linkClass = (active: boolean) =>
  `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium tracking-[-0.01em] transition-all duration-200 ${
    active
      ? "bg-[var(--ff-primary-soft)] text-[var(--ff-primary)]"
      : "text-[var(--ff-text-secondary)] hover:bg-[var(--ff-primary-tint)] hover:text-[var(--ff-text)]"
  }`;

export function SidebarNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = isMoreNavPath(pathname);
  const settingsActive =
    pathname.startsWith("/crm/configuracion") ||
    pathname.startsWith("/crm/usuarios") ||
    pathname.startsWith("/crm/auditoria");

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
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3" aria-label="Principal">
        {PRIMARY_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={linkClass(active)}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="flex-1">{label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          className={`${linkClass(moreActive && !settingsActive)} w-full text-left`}
        >
          <Ellipsis className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="flex-1">Más</span>
        </button>
      </nav>

      <div className="shrink-0 border-t border-[var(--ff-border)] px-3 py-3">
        <Link
          href="/crm/configuracion"
          aria-current={settingsActive ? "page" : undefined}
          className={linkClass(settingsActive)}
        >
          <Settings className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          Configuración
        </Link>
      </div>

      <MoreNavPanel
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        pathname={pathname}
      />
    </>
  );
}
