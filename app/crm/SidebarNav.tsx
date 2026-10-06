"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Archive,
  Briefcase,
  ClipboardList,
  CreditCard,
  FileText,
  Headphones,
  Home,
  Inbox,
  LayoutGrid,
  MessageCircle,
  Package,
  Receipt,
  RefreshCcw,
  Scale,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  Users,
  UsersRound,
  Megaphone,
  Radar,
  Share2,
  Palette,
  FileBarChart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  mails?: boolean;
  chats?: boolean;
};

const FONDIFY_NAV: readonly NavItem[] = [
  { href: "/crm/dashboard", label: "Resumen", icon: Home },
  { href: "/crm/clientes", label: "Clientes", icon: Users },
  { href: "/crm/equipo", label: "Mi Equipo", icon: UsersRound, soon: true },
  { href: "/crm/reportes", label: "Reportes", icon: FileBarChart, soon: true },
  {
    href: "/crm/marketing",
    label: "Email Marketing",
    icon: Megaphone,
    soon: true,
  },
  {
    href: "/crm/prospeccion",
    label: "Prospección en Frío",
    icon: Radar,
    soon: true,
  },
  { href: "/crm/afiliados", label: "Afiliados", icon: Share2, soon: true },
  { href: "/crm/marca", label: "Mi Marca", icon: Palette, soon: true },
];

const OPERACION_NAV: readonly NavItem[] = [
  { href: "/crm/tareas", label: "Pendientes", icon: ClipboardList },
  { href: "/crm/oportunidades", label: "Leads", icon: Target },
  { href: "/crm/casos", label: "Casos", icon: Briefcase },
  { href: "/crm/pagos", label: "Cobrar", icon: CreditCard },
  { href: "/crm/mails", label: "Mensajes", icon: Inbox, mails: true },
  { href: "/crm/chats", label: "Chats", icon: MessageCircle, chats: true },
  { href: "/crm/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/crm/contratos", label: "Contratos", icon: Scale },
  { href: "/crm/planes-pago", label: "Cuotas", icon: LayoutGrid },
  { href: "/crm/recibos", label: "Recibos", icon: Receipt },
  { href: "/crm/rondas", label: "Rondas", icon: RefreshCcw },
  { href: "/crm/servicios", label: "Servicios", icon: Package },
  { href: "/crm/consultas", label: "Consultas", icon: Headphones },
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
  `flex min-h-11 lg:min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium tracking-[-0.01em] transition-[color,background-color] duration-200 motion-reduce:transition-none ${
    active
      ? "bg-nav-active text-action-primary"
      : "text-ink hover:bg-nav-hover"
  } ${extra}`;

function NavLink({
  item,
  pathname,
  inMails,
  inChats,
}: {
  item: NavItem;
  pathname: string;
  inMails: boolean;
  inChats: boolean;
}) {
  const active = item.mails
    ? inMails
    : item.chats
      ? inChats
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  if (item.soon) {
    return (
      <div
        className={`${linkClass(false)} cursor-not-allowed opacity-55`}
        title="Próximamente"
        aria-disabled
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="flex-1">{item.label}</span>
        <span className="rounded-full bg-nav-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          Pronto
        </span>
      </div>
    );
  }

  return (
    <Link
      href={item.mails ? MAIL_HREF : item.href}
      aria-current={active ? "page" : undefined}
      data-cuelume-hover="tick"
      className={linkClass(active)}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

export function SidebarNav({
  organizationName = "J&H Multiservices LLC",
}: {
  organizationName?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inMails = pathname.startsWith("/crm/mails");
  const inChats = pathname.startsWith("/crm/chats");
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
      <div className="mx-3 mt-1 mb-2 rounded-xl border border-border-subtle bg-surface-app/60 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-action-primary text-[13px] font-bold text-action-primary-foreground"
            aria-hidden
          >
            JH
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">
              {organizationName}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Panel de agencia
            </p>
          </div>
        </div>
      </div>

      <nav
        className="flex-1 space-y-4 overflow-y-auto px-3 py-2"
        aria-label="Principal"
      >
        <div className="space-y-1">
          {FONDIFY_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              inMails={inMails}
              inChats={inChats}
            />
          ))}
        </div>

        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Operación
          </p>
          <div className="space-y-1">
            {OPERACION_NAV.map((item) => (
              <div key={item.href}>
                <NavLink
                  item={item}
                  pathname={pathname}
                  inMails={inMails}
                  inChats={inChats}
                />
                {item.mails && inMails ? (
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
                          className={linkClass(
                            folderActive,
                            "min-h-9 py-1.5 text-[13px]",
                          )}
                        >
                          <FolderIcon
                            className="size-3.5 shrink-0"
                            strokeWidth={1.75}
                            aria-hidden
                          />
                          {folder.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </nav>

      <div className="shrink-0 space-y-1 border-border-subtle border-t px-3 py-3">
        <Link
          href="/crm/configuracion"
          aria-current={settingsActive ? "page" : undefined}
          data-cuelume-hover="tick"
          className={linkClass(settingsActive)}
        >
          <Settings className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          Configuración
        </Link>
        <div
          className={`${linkClass(false)} cursor-not-allowed opacity-55`}
          title="Próximamente"
          aria-disabled
        >
          <Sparkles className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="flex-1">Ver planes</span>
        </div>
      </div>
    </>
  );
}
