"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  CalendarClock,
  Cpu,
  CreditCard,
  FileText,
  Headphones,
  Inbox,
  MessageCircle,
  MessageSquareQuote,
  Package,
  Receipt,
  RefreshCcw,
  Scale,
  Settings,
  Target,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type MoreItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type MoreGroup = {
  label: string;
  items: readonly MoreItem[];
};

export const MORE_NAV_GROUPS: readonly MoreGroup[] = [
  {
    label: "Diario",
    items: [
      { href: "/crm/pagos", label: "Cobrar", icon: CreditCard },
      { href: "/crm/mails?folder=inbox", label: "Mensajes", icon: Inbox },
      { href: "/crm/chats", label: "Chats", icon: MessageCircle },
    ],
  },
  {
    label: "Ventas",
    items: [
      { href: "/crm/oportunidades", label: "Leads", icon: Target },
      { href: "/crm/consultas", label: "Consultas", icon: Headphones },
    ],
  },
  {
    label: "Crédito",
    items: [{ href: "/crm/rondas", label: "Rondas", icon: RefreshCcw }],
  },
  {
    label: "Dinero",
    items: [
      { href: "/crm/planes-pago", label: "Cuotas", icon: CalendarClock },
      { href: "/crm/recibos", label: "Recibos", icon: Receipt },
      { href: "/crm/cotizaciones", label: "Cotizaciones", icon: FileText },
      { href: "/crm/servicios", label: "Servicios", icon: Package },
    ],
  },
  {
    label: "Extra",
    items: [
      { href: "/crm/testimonios", label: "Testimonios", icon: MessageSquareQuote },
      { href: "/crm/contratos", label: "Contratos", icon: Scale },
      { href: "/crm/procesadores", label: "Procesadores", icon: Cpu },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/crm/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

/** Rutas que viven solo en Más (para marcar el botón Más como activo). */
export const MORE_NAV_HREFS = [
  ...MORE_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href.split("?")[0])),
  "/crm/pagos",
  "/crm/mails",
  "/crm/chats",
];

export function isMoreNavPath(pathname: string): boolean {
  // Primarios (bottom nav o sidebar): no marcar Más.
  if (
    pathname === "/crm/dashboard" ||
    pathname.startsWith("/crm/tareas") ||
    pathname.startsWith("/crm/oportunidades") ||
    pathname.startsWith("/crm/clientes") ||
    pathname.startsWith("/crm/casos") ||
    pathname.startsWith("/crm/pagos") ||
    pathname.startsWith("/crm/mails") ||
    pathname.startsWith("/crm/chats")
  ) {
    return false;
  }
  return MORE_NAV_HREFS.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

/**
 * Popup centrado “Más”: el resto del CRM en un diálogo redondeado.
 */
const subscribeToMount = () => () => {};
const clientMounted = () => true;
const serverMounted = () => false;

export function MoreNavPanel({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  const mounted = useSyncExternalStore(subscribeToMount, clientMounted, serverMounted);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-6"
      style={{ zIndex: "var(--z-modal)" }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[3px] motion-reduce:backdrop-blur-none"
        aria-label="Cerrar menú Más"
        onClick={onClose}
      />
      <div
        className="jh-overlay-shadow relative z-10 flex max-h-[min(36rem,85dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] bg-surface-elevated"
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-nav-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
          <h2
            id="more-nav-title"
            className="text-[20px] font-semibold tracking-[-0.025em] text-ink"
          >
            Más opciones
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full text-text-secondary-strong transition-colors hover:bg-nav-hover hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <nav
          className="flex-1 overflow-y-auto px-4 pb-5 sm:px-5 sm:pb-6"
          aria-label="Más"
        >
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
            {MORE_NAV_GROUPS.map((group, index) => (
              <div
                key={group.label}
                className={`${
                  index > 0
                    ? "max-sm:border-t max-sm:border-border-subtle/60 max-sm:pt-5"
                    : ""
                } ${
                  index > 1
                    ? "sm:border-t sm:border-border-subtle/60 sm:pt-5"
                    : ""
                }`}
              >
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-secondary">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active =
                      pathname === href || pathname.startsWith(`${href}/`);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-12 items-center gap-3 rounded-surface px-3 text-[15px] tracking-[-0.01em] transition-colors ${
                            active
                              ? "bg-nav-active font-semibold text-action-primary"
                              : "font-medium text-ink hover:bg-nav-hover"
                          }`}
                        >
                          <span
                            className={`flex size-9 shrink-0 items-center justify-center rounded-control ${
                              active
                                ? "bg-action-primary text-action-primary-foreground"
                                : "bg-nav-hover text-text-secondary-strong"
                            }`}
                          >
                            <Icon
                              className="size-[18px]"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </span>
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </div>
    </div>,
    document.body,
  );
}
