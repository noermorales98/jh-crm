import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Paginación cursor-based (Anterior/Siguiente).
 *
 * El servidor devuelve `nextCursor`; el historial de cursores viaja en el
 * param `back` (lista separada por comas) para poder retroceder:
 *   Siguiente → cursor=nextCursor, back=[..., cursorActual]
 *   Anterior  → cursor=último de back (o se omite), back=back sin el último
 *
 * <CursorPagination
 *   pathname="/crm/clientes"
 *   params={{ q, status }}        // params actuales (sin cursor/back)
 *   cursor={cursor}               // cursor actual (o undefined)
 *   nextCursor={result.nextCursor}
 * />
 */
export function CursorPagination({
  pathname,
  params,
  cursor,
  nextCursor,
}: {
  pathname: string;
  params: Record<string, string | undefined>;
  cursor?: string;
  nextCursor: string | null;
}) {
  const backParam = params.back;
  const backStack = backParam ? backParam.split(",").filter(Boolean) : [];
  const page = backStack.length + 1;

  function buildHref(overrides: { cursor?: string; back?: string }): string {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "cursor" && key !== "back") sp.set(key, value);
    }
    if (overrides.cursor) sp.set("cursor", overrides.cursor);
    if (overrides.back) sp.set("back", overrides.back);
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const nextHref = nextCursor
    ? buildHref({
        cursor: nextCursor,
        back: [...backStack, cursor ?? ""].filter(Boolean).join(",") || undefined,
      })
    : null;

  const prevHref =
    backStack.length > 0
      ? (() => {
          const stack = [...backStack];
          const prev = stack.pop() ?? "";
          return buildHref({
            cursor: prev || undefined,
            back: stack.join(",") || undefined,
          });
        })()
      : null;

  if (!nextHref && !prevHref) return null;

  const linkBase =
    "inline-flex min-h-10 items-center gap-1 rounded-control bg-surface-panel px-3.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-nav-active motion-reduce:transition-none";
  const linkDisabled = "pointer-events-none opacity-40";

  return (
    <nav
      aria-label="Paginación"
      className="flex items-center justify-between border-t border-border-subtle px-4 py-3"
    >
      <span className="text-[13px] text-text-secondary">Página {page}</span>
      <div className="flex items-center gap-2">
        {prevHref ? (
          <Link href={prevHref} className={linkBase} data-cuelume-press="page">
            <ChevronLeft className="size-4" aria-hidden />
            Anterior
          </Link>
        ) : (
          <span className={`${linkBase} ${linkDisabled}`} aria-hidden>
            <ChevronLeft className="size-4" />
            Anterior
          </span>
        )}
        {nextHref ? (
          <Link href={nextHref} className={linkBase} data-cuelume-press="page">
            Siguiente
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={`${linkBase} ${linkDisabled}`} aria-hidden>
            Siguiente
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
