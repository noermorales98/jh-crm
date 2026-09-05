"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { openSpotlightSearch } from "@/src/components/search/spotlight-events";

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

/**
 * Campo de búsqueda estilo HIG: acción primaria clara, placeholder
 * descriptivo y target ≥44pt (Searching + Accessibility).
 */
export function DashboardSpotlightField() {
  const [shortcut, setShortcut] = useState("Ctrl K");

  useEffect(() => {
    setShortcut(isMac() ? "⌘K" : "Ctrl K");
  }, []);

  return (
    <section aria-labelledby="dashboard-search-heading" className="space-y-3">
      <h2
        id="dashboard-search-heading"
        className="px-0.5 text-[15px] font-semibold tracking-[-0.01em] text-ink"
      >
        Buscar
      </h2>
      <button
        type="button"
        onClick={openSpotlightSearch}
        aria-label="Buscar en el CRM"
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        className="jh-spotlight-field group flex min-h-14 w-full items-center gap-3 rounded-full bg-surface-elevated px-5 text-left ring-1 ring-border-subtle/50 transition-[background-color,box-shadow] duration-200 hover:bg-nav-hover hover:ring-border-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 motion-reduce:transition-none"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-panel text-text-secondary-strong transition-colors group-hover:bg-nav-active group-hover:text-action-primary">
          <Search className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em] text-text-secondary">
          Clientes, casos, pagos…
        </span>
        <kbd className="hidden shrink-0 rounded-[8px] bg-surface-panel px-2 py-1 text-[11px] font-medium tabular-nums text-text-secondary-strong sm:inline">
          {shortcut}
        </kbd>
      </button>
    </section>
  );
}
