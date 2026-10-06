"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Users,
  UsersRound,
  FileText,
  Mail,
  Search,
  Star,
  Palette,
  Shield,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/crm/agency", label: "Resumen", icon: LayoutGrid },
  { href: "/crm/agency/clients", label: "Clientes", icon: Users },
  { href: "/crm/agency/team", label: "Mi Equipo", icon: UsersRound },
  { href: "/crm/agency/reports", label: "Reportes", icon: FileText },
  { href: "/crm/agency/marketing", label: "Email Marketing", icon: Mail },
  { href: "/crm/agency/prospecting", label: "Prospección en Frío", icon: Search },
  { href: "/crm/agency/affiliates", label: "Afiliados", icon: Star },
  { href: "/crm/agency/brand", label: "Mi Marca", icon: Palette },
];

export function FondifySidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-[var(--ff-topbar-height)] z-[var(--ff-z-sidebar)] flex h-[calc(100vh-var(--ff-topbar-height))] w-[var(--ff-sidebar-width)] flex-col overflow-y-auto border-r border-[var(--ff-border)] bg-[var(--ff-sidebar)] p-3">
      <div className="mb-3 flex items-center gap-2.5 rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] bg-[var(--ff-bg-soft)] p-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff8a4c] to-[#6e1ea3] font-serif text-sm font-extrabold italic text-white">
          f
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold leading-tight text-[var(--ff-text)]">
            JH & Multiservices LLC
          </div>
          <div className="ff-kicker mt-0.5 text-[9px]">Panel de agencia</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`-ml-[3px] flex items-center gap-2.5 rounded-[var(--ff-radius-md)] border-l-[3px] py-2 pl-[15px] pr-3 text-[var(--ff-fs-sm)] font-medium transition-[color,background-color] duration-[var(--ff-duration)] ${
                isActive
                  ? "border-l-[var(--ff-primary)] bg-[var(--ff-primary-soft)] font-semibold text-[var(--ff-primary)]"
                  : "border-l-transparent text-[var(--ff-text-secondary)] hover:bg-[var(--ff-primary-tint)] hover:text-[var(--ff-text)]"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="size-[18px] shrink-0 opacity-75" strokeWidth={1.75} aria-hidden />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-[var(--ff-border)] pt-3">
        <Link
          href="/crm/agency/credit-report"
          className="flex items-center gap-2 px-3 py-2 text-[var(--ff-fs-sm)] text-[var(--ff-text-secondary)] transition-colors hover:text-[var(--ff-text)]"
        >
          <Shield className="size-4" strokeWidth={1.75} aria-hidden />
          Mi reporte de crédito
        </Link>
        <Link
          href="/crm/agency/plans"
          className="flex items-center justify-center gap-2 rounded-[var(--ff-radius-md)] border border-[var(--ff-primary)] px-3 py-2 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-primary)] transition-colors hover:bg-[var(--ff-primary-soft)]"
        >
          <Zap className="size-4" strokeWidth={1.75} aria-hidden />
          Ver planes
        </Link>
      </div>
    </aside>
  );
}
