"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Archive,
  ClipboardList,
  CreditCard,
  Ellipsis,
  FileText,
  Home,
  Inbox,
  MessageCircle,
  Send,
  Settings,
  ShieldAlert,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  MoreNavPanel,
  isMoreNavPath,
} from "@/src/components/layout/more-nav-panel";

type PrimaryItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  mails?: boolean;
  chats?: boolean;
};

/** Navegación diaria: Inicio… Mensajes, Chats, Más. */
const PRIMARY_ITEMS: readonly PrimaryItem[] = [
  { href: "/crm/dashboard", label: "Inicio", icon: Home },
  { href: "/crm/tareas", label: "Pendientes", icon: ClipboardList },
  { href: "/crm/oportunidades", label: "Leads", icon: Target },
  { href: "/crm/clientes", label: "Clientes", icon: Users },
  { href: "/crm/pagos", label: "Cobrar", icon: CreditCard },
  { href: "/crm/mails", label: "Mensajes", icon: Inbox, mails: true },
  { href: "/crm/chats", label: "Chats", icon: MessageCircle, chats: true },
];

const MAIL_FOLDERS: readonly {
  folder: string;
  href: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { folder: "inbox", href: "/crm/mails?folder=inbox", label: "Bandeja", icon: Inbox },
  { folder: "sent", href: "/crm/mails?folder=sent", label: "Enviados", icon: Send },
  { folder: "drafts", href: "/crm/mails?folder=drafts", label: "Borradores", icon: FileText },
  { folder: "archive", href: "/crm/mails?folder=archive", label: "Archivados", icon: Archive },
  { folder: "spam", href: "/crm/mails?folder=spam", label: "Spam", icon: ShieldAlert },
  { folder: "trash", href: "/crm/mails?folder=trash", label: "Papelera", icon: Trash2 },
];

const MAIL_HREF = "/crm/mails?folder=inbox";

const linkClass = (active: boolean, extra = "") =>
  `flex min-h-11 items-center gap-2.5 rounded-[8px] px-2.5 text-[14px] font-normal text-ink transition-colors duration-150 motion-reduce:transition-none lg:min-h-[34px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
    active ? "bg-ink/8" : "hover:bg-ink/5"
  } ${extra}`;

export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const inMails = pathname.startsWith("/crm/mails");
  const inChats = pathname.startsWith("/crm/chats");
  const moreActive = isMoreNavPath(pathname);
  const currentFolder =
    pathname === "/crm/mails"
      ? (searchParams.get("folder") ?? "inbox")
      : searchParams.get("folder");
  const settingsActive =
    pathname.startsWith("/crm/configuracion") ||
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
      <nav
        className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1"
        aria-label="Principal"
      >
        {PRIMARY_ITEMS.map(({ href, label, icon: Lucide, mails, chats }) => {
          const active = mails
            ? inMails
            : chats
              ? inChats
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <div key={href}>
              <Link
                href={mails ? MAIL_HREF : href}
                aria-current={active ? "page" : undefined}
                data-cuelume-hover="tick"
                className={linkClass(active)}
              >
                <Lucide
                  className="size-4 shrink-0 text-text-secondary"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className="flex-1">{label}</span>
              </Link>

              {mails && inMails ? (
                <div
                  className="mt-0.5 space-y-0.5 pl-4"
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
                        className={linkClass(folderActive)}
                      >
                        <FolderIcon
                          className="size-4 shrink-0 text-text-secondary"
                          strokeWidth={1.5}
                          aria-hidden
                        />
                        {folder.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          data-cuelume-hover="tick"
          className={`${linkClass(moreActive && !settingsActive)} w-full text-left`}
        >
          <Ellipsis
            className="size-4 shrink-0 text-text-secondary"
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="flex-1">Más</span>
        </button>
      </nav>

      <div className="shrink-0 border-t border-border-subtle px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Link
          href="/crm/configuracion"
          aria-current={settingsActive ? "page" : undefined}
          data-cuelume-hover="tick"
          className={linkClass(settingsActive)}
        >
          <Settings
            className="size-4 shrink-0 text-text-secondary"
            strokeWidth={1.5}
            aria-hidden
          />
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
