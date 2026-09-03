"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Archive,
  Briefcase,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  Inbox,
  MessageCircle,
  Package,
  Receipt,
  RefreshCcw,
  Send,
  Settings,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  mails?: boolean;
};

type NavSection = {
  label?: string;
  items: readonly NavItem[];
};

const NAV_SECTIONS: readonly NavSection[] = [
  {
    items: [{ href: "/crm/dashboard", label: "Inicio", icon: Home }],
  },
  {
    label: "Comunicación",
    items: [
      { href: "/crm/chats", label: "Chats", icon: MessageCircle },
      { href: "/crm/mails", label: "Correos", icon: Inbox, mails: true },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/crm/clientes", label: "Clientes", icon: Users },
      { href: "/crm/casos", label: "Casos", icon: Briefcase },
      { href: "/crm/rondas", label: "Rondas", icon: RefreshCcw },
      { href: "/crm/tareas", label: "Tareas", icon: ClipboardList },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { href: "/crm/servicios", label: "Servicios", icon: Package },
      { href: "/crm/cotizaciones", label: "Cotizaciones", icon: FileText },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { href: "/crm/pagos", label: "Pagos", icon: CreditCard },
      { href: "/crm/recibos", label: "Recibos", icon: Receipt },
    ],
  },
];

const MAIL_FOLDERS: readonly {
  folder: string;
  href: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { folder: "inbox", href: "/crm/mails?folder=inbox", label: "Bandeja de entrada", icon: Inbox },
  { folder: "sent", href: "/crm/mails?folder=sent", label: "Enviados", icon: Send },
  { folder: "drafts", href: "/crm/mails?folder=drafts", label: "Borradores", icon: FileText },
  { folder: "archive", href: "/crm/mails?folder=archive", label: "Archivados", icon: Archive },
  { folder: "spam", href: "/crm/mails?folder=spam", label: "Spam", icon: ShieldAlert },
  { folder: "trash", href: "/crm/mails?folder=trash", label: "Papelera", icon: Trash2 },
];

const MAIL_HREF = "/crm/mails?folder=inbox";

const linkClass = (active: boolean, extra = "") =>
  `flex min-h-10 items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors duration-200 motion-reduce:transition-none ${
    active
      ? "bg-nav-active font-semibold text-action-primary"
      : "font-medium text-ink hover:bg-nav-hover"
  } ${extra}`;

export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inMails = pathname.startsWith("/crm/mails");
  const currentFolder =
    pathname === "/crm/mails"
      ? (searchParams.get("folder") ?? "inbox")
      : searchParams.get("folder");
  const settingsActive =
    pathname.startsWith("/crm/configuracion") ||
    pathname.startsWith("/crm/usuarios") ||
    pathname.startsWith("/crm/auditoria");

  return (
    <>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2" aria-label="Principal">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label ?? "inicio"} className="space-y-1">
            {section.label ? (
              <p className="px-3 pb-1 pt-1 text-[13px] font-semibold text-text-secondary">
                {section.label}
              </p>
            ) : null}
            {section.items.map(({ href, label, icon: Lucide, mails }) => {
              const active = mails
                ? inMails
                : pathname === href || pathname.startsWith(`${href}/`);

              return (
                <div key={href}>
                  <Link
                    href={mails ? MAIL_HREF : href}
                    aria-current={!mails && active ? "page" : undefined}
                    aria-expanded={mails ? inMails : undefined}
                    data-cuelume-hover="tick"
                    className={`${linkClass(mails ? false : active)} ${mails && inMails ? "font-semibold text-ink" : ""}`}
                  >
                    <Lucide className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="flex-1">{label}</span>
                    {mails ? (
                      <ChevronDown
                        className={`size-4 shrink-0 text-text-secondary transition-transform duration-200 ${
                          inMails ? "rotate-0" : "-rotate-90"
                        }`}
                        aria-hidden
                      />
                    ) : null}
                  </Link>

                  {mails && inMails ? (
                    <div
                      className="mt-1 ml-4 space-y-0.5 border-border-subtle border-l pl-2"
                      role="group"
                      aria-label="Carpetas de correo"
                    >
                      {MAIL_FOLDERS.map((folder) => {
                        const folderActive = currentFolder === folder.folder;
                        const FolderIcon = folder.icon;
                        return (
                          <Link
                            key={folder.folder}
                            href={folder.href}
                            aria-current={folderActive ? "page" : undefined}
                            data-cuelume-hover="tick"
                            className={linkClass(folderActive, "min-h-10 py-1.5 text-[13px]")}
                          >
                            <FolderIcon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                            {folder.label}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-border-subtle border-t px-3 py-3">
        <Link
          href="/crm/configuracion"
          aria-current={settingsActive ? "page" : undefined}
          data-cuelume-hover="tick"
          className={linkClass(settingsActive)}
        >
          <Settings className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          Configuración
        </Link>
      </div>
    </>
  );
}
