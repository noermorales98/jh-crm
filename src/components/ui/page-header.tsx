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
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.022em] text-ink text-balance lg:text-[1.625rem]">
          {title}
        </h1>
        {description ? (
          <div className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-text-secondary text-pretty lg:text-sm">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
