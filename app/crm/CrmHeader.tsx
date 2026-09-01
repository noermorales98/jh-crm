"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const SECTION_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  clientes: "Clientes",
  casos: "Casos",
  rondas: "Rondas",
  tareas: "Tareas",
  servicios: "Servicios",
  cotizaciones: "Cotizaciones",
  pagos: "Pagos",
  recibos: "Recibos",
  chats: "Chats",
  usuarios: "Usuarios",
  auditoria: "Auditoría",
  configuracion: "Configuración",
};

const NESTED_TITLES: Record<string, string> = {
  nuevo: "Nuevo",
  nueva: "Nueva",
  paquetes: "Paquetes",
  etapas: "Etapas",
  expediente: "Expediente",
  actividad: "Actividad",
  documentos: "Documentos",
  rondas: "Rondas",
  tareas: "Tareas",
  cotizaciones: "Cotizaciones",
  pagos: "Pagos",
  casos: "Casos",
};

const HeaderTitleContext = createContext<{
  setTitle: (title: string | null) => void;
}>({ setTitle: () => {} });

const HeaderOverrideContext = createContext<string | null>(null);

export function HeaderTitleProvider({ children }: { children: ReactNode }) {
  const [override, setTitle] = useState<string | null>(null);
  const value = useMemo(() => ({ setTitle }), []);
  return (
    <HeaderTitleContext.Provider value={value}>
      <HeaderOverrideContext.Provider value={override}>
        {children}
      </HeaderOverrideContext.Provider>
    </HeaderTitleContext.Provider>
  );
}

export function HeaderTitle({ title }: { title: string }) {
  const { setTitle } = useContext(HeaderTitleContext);
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);
  return null;
}

export function headerForPath(pathname: string): {
  title: string;
  backHref: string | null;
} {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "crm" || parts.length < 2) {
    return { title: "J&H CRM", backHref: null };
  }

  const section = parts[1];
  const sectionTitle = SECTION_TITLES[section] ?? "J&H CRM";

  if (parts.length === 2) {
    return { title: sectionTitle, backHref: null };
  }

  const last = parts[parts.length - 1];
  const nestedTitle = NESTED_TITLES[last];
  const title = nestedTitle
    ? nestedTitle
    : section === "chats"
      ? "Chat"
      : sectionTitle;

  return { title, backHref: `/${parts.slice(0, -1).join("/")}` };
}

export function CrmHeader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const override = useContext(HeaderOverrideContext);
  const { title, backHref } = headerForPath(pathname);
  const label = override ?? title;

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 bg-surface-app px-6">
      <div className="flex min-w-0 items-center gap-1">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Volver"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary-strong transition-colors duration-200 hover:bg-nav-hover hover:text-ink motion-reduce:transition-none"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        ) : null}
        <p className="truncate text-sm font-medium text-ink">{label}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </header>
  );
}
