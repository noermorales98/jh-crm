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
      className={`rounded-surface bg-surface-elevated ${className}`}
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
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
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
