"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Archive,
  Ellipsis,
  FileBarChart2,
  FileText,
  Home,
  Inbox,
  Send,
  Scale,
  Settings,
  ShieldAlert,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  MoreNavPanel,
  SIDEBAR_PRIMARY_HREFS,
  isMoreNavPath,
} from "@/src/components/layout/more-nav-panel";
import { lockBodyScroll } from "@/src/lib/ui/body-scroll-lock";
import { REPORTES_HREF, REPORTES_NAV_LABEL } from "@/src/lib/reports/agency-reportes";

type PrimaryItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rutas hermanas que viven como pestañas de esta sección. */
  related?: readonly string[];
};

/** Navegación estilo Fondify: lo diario; el resto vive en Más. */
const PRIMARY_ITEMS: readonly PrimaryItem[] = [
  { href: "/crm/dashboard", label: "Resumen", icon: Home },
  { href: "/crm/clientes", label: "Clientes", icon: Users },
  { href: REPORTES_HREF, label: REPORTES_NAV_LABEL, icon: FileBarChart2 },
  { href: "/crm/rondas", label: "Disputas", icon: Scale },
  { href: "/crm/oportunidades", label: "Ventas", icon: Target, related: ["/crm/consultas"] },
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

const linkClass = (active: boolean, extra = "") =>
  `flex min-h-11 items-center gap-2.5 rounded-[8px] px-2.5 text-[14px] font-normal text-ink transition-colors duration-150 motion-reduce:transition-none lg:min-h-[34px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
    active ? "bg-ink/8" : "hover:bg-ink/5"
  } ${extra}`;

export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [moreOpen, setMoreOpen] = useState(false);
  const inMails = pathname.startsWith("/crm/mails");
  const moreActive = isMoreNavPath(pathname, SIDEBAR_PRIMARY_HREFS);
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
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [moreOpen]);

  return (
    <>
      <nav
        className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1"
        aria-label="Principal"
      >
        {PRIMARY_ITEMS.map(({ href, label, icon: Lucide, related }) => {
          const active = [href, ...(related ?? [])].some(
            (h) => pathname === h || pathname.startsWith(`${h}/`),
          );

          return (
            <div key={href}>
              <Link
                href={href}
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
            </div>
          );
        })}

        {inMails ? (
          <div
            className="mt-2 space-y-0.5 border-t border-border-subtle pt-2"
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
