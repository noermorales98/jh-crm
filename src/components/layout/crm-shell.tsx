"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { CrmMobileBottomNav } from "@/src/components/layout/crm-mobile-bottom-nav";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useCrmSidebar() {
  const value = useContext(SidebarContext);
  if (!value) {
    throw new Error("useCrmSidebar debe usarse dentro de CrmShell");
  }
  return value;
}

export function CrmShell({
  brand,
  sidebar,
  header,
  children,
}: {
  brand: ReactNode;
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open || desktop) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, desktop]);

  const drawerOpen = desktop || open;

  return (
    <SidebarContext.Provider
      value={{ open, setOpen, toggle: () => setOpen((value) => !value) }}
    >
      <div className="flex min-h-screen bg-surface-app">
        <a href="#contenido-principal" className="jh-skip-link">
          Saltar al contenido
        </a>

        {open && !desktop ? (
          <button
            type="button"
            className="fixed inset-0 z-overlay bg-ink/40 lg:hidden"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <aside
          id="crm-sidebar"
          aria-label="Navegación"
          inert={!drawerOpen ? true : undefined}
          className={`crm-brand fixed inset-y-0 left-0 z-dropdown flex w-72 max-w-[85vw] flex-col border-r border-border-subtle/70 bg-surface-panel pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-out motion-reduce:transition-none lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
            {brand}
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary-strong transition-colors duration-200 hover:bg-nav-hover hover:text-ink lg:hidden motion-reduce:transition-none"
              aria-label="Cerrar menú"
              onClick={() => setOpen(false)}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {sidebar}
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
          {header}
          {children}
          <CrmMobileBottomNav />
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
