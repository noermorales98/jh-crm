import Link from "next/link";
import type { FondifyBucket } from "@/src/lib/fondify/status";
import { FONDIFY_BUCKET_LABELS } from "@/src/lib/fondify/status";

const PILL_TONES: Record<FondifyBucket | "all", string> = {
  all: "border-action-primary/40 bg-nav-active text-action-primary",
  ready: "border-success/40 bg-success-soft text-success-ink",
  struct: "border-warning/40 bg-warning-soft text-warning-ink",
  repair: "border-danger/40 bg-danger-soft text-danger",
};

const ACTIVE_RING: Record<FondifyBucket | "all", string> = {
  all: "ring-2 ring-action-primary/30 border-action-primary",
  ready: "ring-2 ring-success/30 border-success",
  struct: "ring-2 ring-warning/30 border-warning",
  repair: "ring-2 ring-danger/30 border-danger",
};

export function FilterPills({
  active,
  counts,
  q,
}: {
  active: FondifyBucket | "all";
  counts: Record<FondifyBucket | "all", number>;
  q?: string;
}) {
  const items: Array<{ key: FondifyBucket | "all"; label: string }> = [
    { key: "all", label: "TODOS" },
    { key: "ready", label: FONDIFY_BUCKET_LABELS.ready },
    { key: "struct", label: FONDIFY_BUCKET_LABELS.struct },
    { key: "repair", label: FONDIFY_BUCKET_LABELS.repair },
  ];

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros">
      {items.map((item) => {
        const href =
          item.key === "all"
            ? q
              ? `/crm/clientes?q=${encodeURIComponent(q)}`
              : "/crm/clientes"
            : `/crm/clientes?status=${item.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
        const isActive = active === item.key;
        return (
          <Link
            key={item.key}
            href={href}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              PILL_TONES[item.key]
            } ${isActive ? ACTIVE_RING[item.key] : ""}`}
            aria-current={isActive ? "true" : undefined}
          >
            {item.label} · {counts[item.key]}
          </Link>
        );
      })}
    </div>
  );
}
