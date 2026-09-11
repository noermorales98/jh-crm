"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ChatBlobatar } from "@/src/components/ai/chat-blobatar";
import { SpotlightSearch } from "@/src/components/search/spotlight-search";
import type { Role } from "@prisma/client";

const SECTION_TITLES: Record<string, string> = {
  dashboard: "Inicio",
  clientes: "Clientes",
  casos: "Casos",
  rondas: "Rondas",
  tareas: "Hoy",
  servicios: "Servicios",
  cotizaciones: "Cotizaciones",
  pagos: "Cobrar",
  recibos: "Recibos",
  chats: "Chats",
  mails: "Mensajes",
  usuarios: "Usuarios",
  auditoria: "Auditoría",
  configuracion: "Configuración",
  consultas: "Consultas",
  procesadores: "Procesadores",
  contratos: "Contratos",

  "planes-pago": "Cuotas",
};

const NESTED_TITLES: Record<string, string> = {
  nuevo: "Nuevo",
  nueva: "Nueva",
  paquetes: "Paquetes",
  etapas: "Etapas",
  notificaciones: "Notificaciones",
  expediente: "Expediente",
  actividad: "Actividad",
  documentos: "Documentos",
  rondas: "Rondas",
  tareas: "Tareas",
  cotizaciones: "Cotizaciones",
  pagos: "Pagos",
  casos: "Casos",
};

type HeaderOverride = {
  title: string | null;
  blobatarName: string | null;
};

const EMPTY_OVERRIDE: HeaderOverride = { title: null, blobatarName: null };

const HeaderTitleContext = createContext<{
  setOverride: (value: HeaderOverride) => void;
}>({ setOverride: () => {} });

const HeaderOverrideContext = createContext<HeaderOverride>(EMPTY_OVERRIDE);

export function HeaderTitleProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<HeaderOverride>(EMPTY_OVERRIDE);
  const value = useMemo(() => ({ setOverride }), []);
  return (
    <HeaderTitleContext.Provider value={value}>
      <HeaderOverrideContext.Provider value={override}>
        {children}
      </HeaderOverrideContext.Provider>
    </HeaderTitleContext.Provider>
  );
}

export function HeaderTitle({
  title,
  blobatarName,
}: {
  title: string;
  blobatarName?: string;
}) {
  const { setOverride } = useContext(HeaderTitleContext);
  useEffect(() => {
    setOverride({ title, blobatarName: blobatarName ?? null });
    return () => setOverride(EMPTY_OVERRIDE);
  }, [setOverride, title, blobatarName]);
  return null;
}

const NAV_STACK_KEY = "jh-crm-nav-stack";
const NAV_STACK_MAX = 50;
const LEGACY_PREV_KEY = "jh-crm-nav-prev";
const LEGACY_CURR_KEY = "jh-crm-nav-curr";

function isCrmHref(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/crm");
}

function readNavStack(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(NAV_STACK_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(isCrmHref);
    }
    const prev = sessionStorage.getItem(LEGACY_PREV_KEY);
    const curr = sessionStorage.getItem(LEGACY_CURR_KEY);
    const seeded = [prev, curr].filter(isCrmHref);
    return seeded.filter((href, i) => seeded.indexOf(href) === i);
  } catch {
    return [];
  }
}

function writeNavStack(stack: string[]) {
  try {
    sessionStorage.setItem(
      NAV_STACK_KEY,
      JSON.stringify(stack.slice(-NAV_STACK_MAX)),
    );
    sessionStorage.removeItem(LEGACY_PREV_KEY);
    sessionStorage.removeItem(LEGACY_CURR_KEY);
  } catch {
    // modo privado / cuota
  }
}

/**
 * Pila de rutas CRM (Chats → chat → cliente).
 * Atrás recorre el historial; si no hay pila, usa el padre de la URL.
 */
function useCrmBackHref(pathname: string, fallback: string | null): string | null {
  const searchParams = useSearchParams();
  const full = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;
  const [href, setHref] = useState<string | null>(fallback);

  useLayoutEffect(() => {
    let stack = readNavStack();
    const last = stack[stack.length - 1];
    if (last !== full) {
      const existing = stack.lastIndexOf(full);
      stack =
        existing >= 0 ? stack.slice(0, existing + 1) : [...stack, full];
      writeNavStack(stack);
    }

    if (!fallback) {
      setHref(null);
      return;
    }

    const previous = stack[stack.length - 2];
    setHref(previous && previous !== full ? previous : fallback);
  }, [full, fallback]);

  return fallback ? href : null;
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
  if (section === "mails" && last === "nuevo") {
    return { title: "Redactar", backHref: "/crm/mails" };
  }
  const nestedTitle = NESTED_TITLES[last];
  const title = nestedTitle
    ? nestedTitle
    : section === "chats"
      ? "Chat"
      : sectionTitle;

  return { title, backHref: `/${parts.slice(0, -1).join("/")}` };
}

export function CrmHeader({
  children,
  role,
}: {
  children: ReactNode;
  role: Role | null;
}) {
  const pathname = usePathname();
  const override = useContext(HeaderOverrideContext);
  const { title, backHref: structuralBack } = headerForPath(pathname);
  const backHref = useCrmBackHref(pathname, structuralBack);
  const label = override.title ?? title;

  const showTitle = Boolean(backHref || override.blobatarName);

  return (
    <header className="jh-toolbar sticky top-0 z-sticky flex h-14 items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] lg:h-16 lg:px-6">
      <div className="flex min-w-0 items-center gap-1.5">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Volver"
            data-cuelume-hover="tick"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary-strong transition-colors duration-200 hover:bg-nav-hover hover:text-ink motion-reduce:transition-none"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        ) : null}
        {override.blobatarName ? (
          <ChatBlobatar
            name={override.blobatarName}
            size={28}
            className="shrink-0"
            title={label}
          />
        ) : null}
        <p
          className={`truncate text-[15px] font-semibold tracking-[-0.01em] text-ink ${
            showTitle ? "" : "hidden"
          }`}
        >
          {label}
        </p>
      </div>
      <SpotlightSearch role={role} />
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </header>
  );
}
