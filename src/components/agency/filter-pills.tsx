import Link from "next/link";
import type { FondifyBucket } from "@/src/lib/fondify/status";
import { FONDIFY_BUCKET_LABELS } from "@/src/lib/fondify/status";

/**
 * Filtros monocromo (HIG color: un acento, no un arcoíris de chips).
 * Activo = fill primary; inactivo = fill neutro. Sin bordes ni rings.
 */
export function FilterPills({
  active,
  counts,
  q,
  usState,
}: {
  active: FondifyBucket | "all";
  counts: Record<FondifyBucket | "all", number>;
  q?: string;
  /** Estado donde vive (TX): se conserva al cambiar de etapa. */
  usState?: string;
}) {
  const items: Array<{ key: FondifyBucket | "all"; label: string }> = [
    { key: "all", label: "Todos" },
    { key: "ready", label: FONDIFY_BUCKET_LABELS.ready },
    { key: "struct", label: FONDIFY_BUCKET_LABELS.struct },
    { key: "repair", label: FONDIFY_BUCKET_LABELS.repair },
  ];

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        Etapa del cliente
      </p>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Etapa del cliente"
      >
      {items.map((item) => {
        const params = new URLSearchParams();
        if (item.key !== "all") params.set("status", item.key);
        if (q) params.set("q", q);
        if (usState) params.set("state", usState);
        const query = params.toString();
        const href = query ? `/crm/clientes?${query}` : "/crm/clientes";
        const isActive = active === item.key;
        return (
          <Link
            key={item.key}
            href={href}
            className={`inline-flex min-h-8 items-center rounded-full px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] transition-colors ${
              isActive
                ? "bg-action-primary text-action-primary-foreground"
                : "bg-nav-hover text-text-secondary-strong hover:bg-nav-active hover:text-action-primary"
            }`}
            aria-current={isActive ? "true" : undefined}
          >
            {item.label}
            <span
              className={`ml-1.5 tabular-nums ${
                isActive
                  ? "text-action-primary-foreground/80"
                  : "text-text-secondary"
              }`}
            >
              {counts[item.key]}
            </span>
          </Link>
        );
      })}
      </div>
    </div>
  );
}
