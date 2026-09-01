"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Buscador que escribe el param `q` en la URL (client).
 * Navega al enviar (Enter o botón) y limpia cursor/back para reiniciar
 * la paginación. Conserva los demás filtros activos.
 */
export function SearchInput({
  placeholder = "Buscar…",
  paramName = "q",
  defaultValue = "",
}: {
  placeholder?: string;
  paramName?: string;
  defaultValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);

  function navigate(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("cursor");
    sp.delete("back");
    if (next.trim()) {
      sp.set(paramName, next.trim());
    } else {
      sp.delete(paramName);
    }
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(value);
      }}
      className="relative"
    >
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-placeholder"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="block min-h-11 w-full rounded-control border border-border-subtle bg-surface-elevated py-2 pl-9 pr-8 text-sm text-ink placeholder:text-text-placeholder focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/15 sm:w-72"
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            setValue("");
            navigate("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-placeholder hover:text-text-secondary-strong"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </form>
  );
}
