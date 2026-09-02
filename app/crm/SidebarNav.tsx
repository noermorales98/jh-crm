"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Briefcase,
  RefreshCcw,
  ClipboardList,
  Package,
  FileText,
  CreditCard,
  Receipt,
  MessageCircle,
  UserCog,
  ScrollText,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Home01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/src/components/icons/icon";

const NAV_ITEMS: readonly {
  href: string;
  label: string;
  icon?: LucideIcon;
}[] = [
  { href: "/crm/dashboard", label: "Dashboard" },
  { href: "/crm/clientes", label: "Clientes", icon: Users },
  { href: "/crm/casos", label: "Casos", icon: Briefcase },
  { href: "/crm/rondas", label: "Rondas", icon: RefreshCcw },
  { href: "/crm/tareas", label: "Tareas", icon: ClipboardList },
  { href: "/crm/servicios", label: "Servicios", icon: Package },
  { href: "/crm/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/crm/pagos", label: "Pagos", icon: CreditCard },
  { href: "/crm/recibos", label: "Recibos", icon: Receipt },
  { href: "/crm/chats", label: "Chats", icon: MessageCircle },
  { href: "/crm/usuarios", label: "Usuarios", icon: UserCog },
  { href: "/crm/auditoria", label: "Auditoría", icon: ScrollText },
  { href: "/crm/configuracion", label: "Configuración", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
      {NAV_ITEMS.map(({ href, label, icon: Lucide }) => {
        const active =
          pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            data-cuelume-hover="tick"
            className={`flex min-h-10 items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors duration-200 motion-reduce:transition-none ${
              active
                ? "bg-nav-active font-semibold text-action-primary"
                : "font-medium text-ink hover:bg-nav-hover"
            }`}
          >
            {href === "/crm/dashboard" ? (
              <Icon icon={Home01Icon} size={16} className="shrink-0" aria-hidden />
            ) : Lucide ? (
              <Lucide className="size-4 shrink-0" aria-hidden />
            ) : null}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
