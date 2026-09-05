import type { ReactNode } from "react";

/**
 * Barra de búsqueda + filtros fuera de la tabla: sin fondo, separada del Card.
 * Izquierda: buscar; derecha: selects.
 */
export function ListToolbar({
  search,
  filters,
}: {
  search?: ReactNode;
  filters?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      {search ? <div className="min-w-0 flex-1 sm:max-w-md">{search}</div> : null}
      {filters ? (
        <div className="flex shrink-0 flex-wrap items-end justify-start gap-3 sm:justify-end">
          {filters}
        </div>
      ) : null}
    </div>
  );
}
