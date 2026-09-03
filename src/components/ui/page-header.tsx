import type { ReactNode } from "react";

/**
 * Encabezado de página: título (+ descripción opcional) y acciones a la derecha.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {description ? (
          <div className="mt-1 max-w-prose text-sm text-text-secondary">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
