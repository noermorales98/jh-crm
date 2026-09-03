import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Estado vacío para listas y secciones sin datos. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "px-4 py-8" : "px-6 py-16"
      }`}
    >
      {Icon ? (
        <div
          className={`mb-3 flex items-center justify-center rounded-full bg-surface-panel text-text-secondary ${
            compact ? "size-10" : "size-12"
          }`}
        >
          <Icon className={compact ? "size-5" : "size-6"} strokeWidth={1.75} aria-hidden />
        </div>
      ) : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-pretty text-sm text-text-secondary">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
