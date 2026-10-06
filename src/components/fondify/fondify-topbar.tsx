"use client";

import Link from "next/link";
import { Bell, HelpCircle, Grid3x3, Sparkles } from "lucide-react";

export function FondifyTopbar() {
  return (
    <header className="sticky top-0 z-[var(--ff-z-topbar)] flex h-[var(--ff-topbar-height)] items-center justify-between border-b border-[var(--ff-border)] bg-[var(--ff-topbar)] px-5">
      <Link href="/crm/agency" className="inline-flex items-center gap-2 text-[1.125rem] font-bold tracking-[-0.02em] text-[var(--ff-text)] no-underline hover:no-underline">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff8a4c] via-[#e879f9] to-[#6e1ea3] font-serif text-[15px] font-extrabold italic text-white">
          f
        </span>
        fondify
      </Link>

      <div className="flex items-center gap-1 text-[var(--ff-text-secondary)]">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[var(--ff-radius-md)] px-2.5 py-2 text-[var(--ff-fs-sm)] font-medium transition-colors hover:bg-[var(--ff-bg-soft)] hover:text-[var(--ff-text)]"
          aria-label="Notificaciones"
        >
          <Bell className="size-[18px]" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[var(--ff-radius-md)] px-2.5 py-2 text-[var(--ff-fs-sm)] font-medium transition-colors hover:bg-[var(--ff-bg-soft)] hover:text-[var(--ff-text)]"
        >
          <Sparkles className="size-[18px]" strokeWidth={1.75} />
          Novedades
        </button>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[var(--ff-radius-md)] px-2.5 py-2 text-[var(--ff-fs-sm)] font-medium transition-colors hover:bg-[var(--ff-bg-soft)] hover:text-[var(--ff-text)]"
          aria-label="Ayuda"
        >
          <HelpCircle className="size-[18px]" strokeWidth={1.75} />
        </button>

        <div className="mx-1.5 inline-flex overflow-hidden rounded-full border border-[var(--ff-border)] text-[11px] font-bold" aria-label="Idioma">
          <span className="bg-[var(--ff-text)] px-2.5 py-1 text-white">ES</span>
          <span className="px-2.5 py-1 text-[var(--ff-text-muted)]">EN</span>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[var(--ff-radius-md)] px-2.5 py-2 text-[var(--ff-fs-sm)] font-medium transition-colors hover:bg-[var(--ff-bg-soft)] hover:text-[var(--ff-text)]"
          aria-label="Productos"
        >
          <Grid3x3 className="size-[18px]" strokeWidth={1.75} />
        </button>

        <div className="ml-1 flex size-8 items-center justify-center rounded-full border-[1.5px] border-[var(--ff-primary-muted)] bg-[var(--ff-primary-soft)] text-sm text-[var(--ff-primary)]" title="Cuenta">
          🏢
        </div>
      </div>
    </header>
  );
}
