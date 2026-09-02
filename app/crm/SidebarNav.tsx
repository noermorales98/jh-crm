"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  Inbox,
  Send,
  Archive,
  ShieldAlert,
  Trash2,
  ChevronDown,
  Globe,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Home01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/src/components/icons/icon";

const NAV_ITEMS: readonly {
  href: string;
  label: string;
  icon?: LucideIcon;
}[] = [
  { href: "/crm/dashboard", label: "Inicio" },
  { href: "/crm/chats", label: "Chats", icon: MessageCircle },
  { href: "/crm/mails", label: "Correos", icon: Inbox },
  { href: "/crm/clientes", label: "Clientes", icon: Users },
  { href: "/crm/casos", label: "Casos", icon: Briefcase },
  { href: "/crm/rondas", label: "Rondas", icon: RefreshCcw },
  { href: "/crm/tareas", label: "Tareas", icon: ClipboardList },
  { href: "/crm/servicios", label: "Servicios", icon: Package },
  { href: "/crm/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/crm/pagos", label: "Pagos", icon: CreditCard },
  { href: "/crm/recibos", label: "Recibos", icon: Receipt },
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

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
      {NAV_ITEMS.map(({ href, label, icon: Lucide }) => {
        const isMails = href === "/crm/mails";
        const active = isMails
          ? inMails
          : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <div key={href}>
            <Link
              href={isMails ? MAIL_HREF : href}
              aria-current={!isMails && active ? "page" : undefined}
              aria-expanded={isMails ? inMails : undefined}
              data-cuelume-hover="tick"
              className={`${linkClass(isMails ? false : active)} ${isMails && inMails ? "font-semibold text-ink" : ""}`}
            >
              {href === "/crm/dashboard" ? (
                <Icon icon={Home01Icon} size={16} className="shrink-0" aria-hidden />
              ) : Lucide ? (
                <Lucide className="size-4 shrink-0" aria-hidden />
              ) : null}
              <span className="flex-1">{label}</span>
              {isMails ? (
                <ChevronDown
                  className={`size-4 shrink-0 text-text-secondary transition-transform duration-200 ${
                    inMails ? "rotate-0" : "-rotate-90"
                  }`}
                  aria-hidden
                />
              ) : null}
            </Link>

            {isMails && inMails ? (
              <div className="mt-1 space-y-0.5 border-l border-border-subtle ml-4 pl-2" role="group" aria-label="Carpetas de correo">
                {MAIL_FOLDERS.map((folder) => {
                  const folderActive = currentFolder === folder.folder;
                  const FolderIcon = folder.icon;
                  return (
                    <Link
                      key={folder.folder}
                      href={folder.href}
                      aria-current={folderActive ? "page" : undefined}
                      data-cuelume-hover="tick"
                      className={linkClass(folderActive, "min-h-9 py-1.5 text-[13px]")}
                    >
                      <FolderIcon className="size-3.5 shrink-0" aria-hidden />
                      {folder.label}
                    </Link>
                  );
                })}
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cuelume-hover="tick"
                  className={linkClass(false, "min-h-9 py-1.5 text-[13px]")}
                >
                  <Globe className="size-3.5 shrink-0" aria-hidden />
                  Ir al sitio web principal
                </a>
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
