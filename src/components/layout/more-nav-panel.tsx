"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ClipboardList,
  CreditCard,
  FileText,
  Inbox,
  MessageCircle,
  MessageSquareQuote,
  Package,
  Settings,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  EQUIPO_HREF,
  EQUIPO_NAV_DESCRIPTION,
  EQUIPO_NAV_LABEL,
} from "@/src/lib/users/equipo";

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
        href: "/crm/tareas",
        label: "Pendientes",
        icon: ClipboardList,
        description: "Tareas y seguimientos del equipo.",
      },
      {
        href: "/crm/pagos",
        label: "Pagos",
        icon: CreditCard,
        description: "Cobrar, cuotas y recibos en un solo lugar.",
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
    label: "Catálogo",
    items: [
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
      {
        href: "/crm/testimonios",
        label: "Testimonios",
        icon: MessageSquareQuote,
        description: "Opiniones y casos de éxito.",
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        href: EQUIPO_HREF,
        label: EQUIPO_NAV_LABEL,
        icon: UsersRound,
        description: EQUIPO_NAV_DESCRIPTION,
      },
      {
        href: "/crm/configuracion",
        label: "Configuración",
        icon: Settings,
        description: "Empresa, notificaciones, procesadores, contratos y más.",
      },
    ],
  },
];

/** Rutas que viven solo en Más (para marcar el botón Más como activo). */
export const MORE_NAV_HREFS = [
  ...MORE_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href.split("?")[0])),
  "/crm/pagos",
  "/crm/planes-pago",
  "/crm/recibos",
  "/crm/consultas",
  "/crm/procesadores",
  "/crm/contratos",
  "/crm/mails",
  "/crm/chats",
];

/** Primarios del sidebar: Más no se marca en estas rutas. */
export const SIDEBAR_PRIMARY_HREFS = [
  "/crm/dashboard",
  "/crm/clientes",
  "/crm/reportes",
  "/crm/rondas",
  "/crm/oportunidades",
  "/crm/consultas",
] as const;

/** Primarios de la barra inferior móvil; el resto vive en Más. */
export const MOBILE_BOTTOM_PRIMARY_HREFS = [
  "/crm/dashboard",
  "/crm/clientes",
  "/crm/reportes",
  "/crm/rondas",
] as const;

export function isMoreNavPath(
  pathname: string,
  primaryHrefs: readonly string[],
): boolean {
  if (
    primaryHrefs.some(
      (href) => pathname === href || pathname.startsWith(`${href}/`),
    )
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
        className="absolute inset-0 bg-ink/40"
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
                <p className="mb-1.5 px-2.5 text-[12px] font-medium text-text-secondary">
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
                          className={`flex min-h-11 items-start gap-2.5 rounded-[8px] px-2.5 py-1.5 text-[14px] font-normal text-ink transition-colors ${
                            active ? "bg-ink/8" : "hover:bg-ink/5"
                          }`}
                        >
                          <Icon
                            className="mt-0.5 size-4 shrink-0 text-text-secondary"
                            strokeWidth={1.5}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block leading-snug">{label}</span>
                            <span className="mt-0.5 line-clamp-1 block text-[12px] font-normal leading-snug text-text-secondary">
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
