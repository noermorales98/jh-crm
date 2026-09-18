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
  description: string;
};

type MoreGroup = {
  label: string;
  items: readonly MoreItem[];
};

export const MORE_NAV_GROUPS: readonly MoreGroup[] = [
  {
    label: "Diario",
    items: [
      {
        href: "/crm/pagos",
        label: "Cobrar",
        icon: CreditCard,
        description: "Registra pagos o genera links Stripe de cotizaciones.",
      },
      {
        href: "/crm/mails?folder=inbox",
        label: "Mensajes",
        icon: Inbox,
        description: "Bandeja de correo del CRM.",
      },
      {
        href: "/crm/chats",
        label: "Chats",
        icon: MessageCircle,
        description: "Conversaciones con el asistente de IA.",
      },
    ],
  },
  {
    label: "Ventas",
    items: [
      {
        href: "/crm/oportunidades",
        label: "Leads",
        icon: Target,
        description: "Pipeline de oportunidades y seguimiento.",
      },
      {
        href: "/crm/consultas",
        label: "Consultas",
        icon: Headphones,
        description: "Solicitudes de consulta y cobro online.",
      },
    ],
  },
  {
    label: "Crédito",
    items: [
      {
        href: "/crm/rondas",
        label: "Rondas",
        icon: RefreshCcw,
        description: "Rondas de disputa y seguimiento por buró.",
      },
    ],
  },
  {
    label: "Dinero",
    items: [
      {
        href: "/crm/planes-pago",
        label: "Cuotas",
        icon: CalendarClock,
        description: "Planes de pago a plazos.",
      },
      {
        href: "/crm/recibos",
        label: "Recibos",
        icon: Receipt,
        description: "Comprobantes emitidos a clientes.",
      },
      {
        href: "/crm/cotizaciones",
        label: "Cotizaciones",
        icon: FileText,
        description: "Propuestas de precio y links de pago.",
      },
      {
        href: "/crm/servicios",
        label: "Servicios",
        icon: Package,
        description: "Catálogo de servicios y paquetes.",
      },
    ],
  },
  {
    label: "Extra",
    items: [
      {
        href: "/crm/testimonios",
        label: "Testimonios",
        icon: MessageSquareQuote,
        description: "Opiniones y casos de éxito.",
      },
      {
        href: "/crm/contratos",
        label: "Contratos",
        icon: Scale,
        description: "Acuerdos y documentos contractuales.",
      },
      {
        href: "/crm/procesadores",
        label: "Procesadores",
        icon: Cpu,
        description: "Portales externos (SmartCredit, etc.).",
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        href: "/crm/configuracion",
        label: "Configuración",
        icon: Settings,
        description: "Org, Stripe, Whapi, notificaciones y más.",
      },
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
        className="jh-overlay-shadow relative z-10 flex max-h-[min(92dvh,56rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[22px] bg-surface-elevated"
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {MORE_NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-secondary">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map(({ href, label, description, icon: Icon }) => {
                    const active =
                      pathname === href || pathname.startsWith(`${href}/`);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-11 items-start gap-2.5 rounded-surface px-2.5 py-1.5 text-[14px] tracking-[-0.01em] transition-colors ${
                            active
                              ? "bg-nav-active font-semibold text-action-primary"
                              : "font-medium text-ink hover:bg-nav-hover"
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control ${
                              active
                                ? "bg-action-primary text-action-primary-foreground"
                                : "bg-nav-hover text-text-secondary-strong"
                            }`}
                          >
                            <Icon
                              className="size-4"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block leading-snug">{label}</span>
                            <span className="mt-0.5 line-clamp-1 block text-[10px] font-normal leading-snug text-text-secondary">
                              {description}
                            </span>
                          </span>
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
