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
        compact ? "px-4 py-6" : "px-6 py-14"
      }`}
    >
      {Icon ? (
        <Icon
          className={`mb-2 text-brand-silver ${compact ? "size-7" : "mb-3 size-9"}`}
          aria-hidden
        />
      ) : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
