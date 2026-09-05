"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

/**
 * Navegación inferior del portal (móvil y desktop estrecho).
 */
export function PortalNav({
  items,
}: {
  items: readonly { href: string; label: string; icon: LucideIcon }[];
}) {
  const pathname = usePathname();

  return (
    <nav
      className="jh-mobile-bottom-nav fixed inset-x-0 bottom-0 z-sticky border-t border-border-subtle/80 bg-surface-elevated/95 backdrop-blur-md"
      aria-label="Portal"
    >
      <div className="mx-auto flex max-w-5xl items-stretch justify-between gap-0.5 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/portal"
              ? pathname === "/portal"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] px-1 py-1 text-[10px] font-medium tracking-[-0.01em] transition-colors ${
                active
                  ? "text-action-primary"
                  : "text-text-secondary hover:text-ink"
              }`}
            >
              <Icon
                className={`size-5 ${active ? "stroke-[2.25]" : ""}`}
                aria-hidden
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
