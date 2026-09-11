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
        compact ? "px-4 py-10" : "px-6 py-14"
      }`}
    >
      {Icon ? (
        <div
          className="mb-3.5 flex size-11 items-center justify-center rounded-full bg-surface-panel text-text-secondary"
        >
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </div>
      ) : null}
      <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-pretty text-[13px] leading-relaxed text-text-secondary">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
