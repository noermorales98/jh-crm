import type { ReactNode } from "react";

/** Tarjeta base: blanca, plana en reposo (sin sombra), radio 12px. */
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-surface border border-border-subtle/80 bg-surface-elevated ${className}`}
    >
      {children}
    </div>
  );
}

/** Encabezado de tarjeta con título y acciones opcionales. */
export function CardHeader({
  title,
  description,
  actions,
  compact = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle ${
        compact ? "px-4 py-2.5" : "px-5 py-4"
      }`}
    >
      <div className="min-w-0">
        <h2 className={`font-semibold text-ink ${compact ? "text-sm" : "text-base"}`}>
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-[13px] text-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function CardBody({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
