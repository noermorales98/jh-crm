/**
 * Fondify PageHeader — encabezado de página estilo Fondify
 * con kicker ALLCAPS, título grande, subtítulo y acciones
 */

import type { ReactNode } from "react";

type PageHeaderFondifyProps = {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeaderFondify({
  kicker,
  title,
  subtitle,
  actions,
  className = "",
}: PageHeaderFondifyProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {kicker && (
        <p className="text-[var(--ff-fs-xs)] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-muted)]">
          {kicker}
        </p>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[var(--ff-fs-xl)] font-bold tracking-[-0.01em] text-[var(--ff-text)] leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-[var(--ff-fs-md)] text-[var(--ff-text-secondary)] leading-normal">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
