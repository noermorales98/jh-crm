"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * FilterBar: contenedor horizontal de filtros.
 * FilterSelect: select que escribe su param en la URL al cambiar,
 * reiniciando la paginación (cursor/back) y conservando los demás.
 *
 * <FilterBar>
 *   <FilterSelect name="status" label="Estado" options={[{value, label}]} />
 * </FilterBar>
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">{children}</div>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterSelect({
  name,
  label,
  options,
  allLabel = "Todos",
}: {
  name: string;
  label: string;
  options: FilterOption[];
  allLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(name) ?? "";

  return (
    <div>
      <label
        htmlFor={`filter-${name}`}
        className="mb-1 block text-[13px] font-semibold text-text-secondary-strong"
      >
        {label}
      </label>
      <select
        id={`filter-${name}`}
        value={current}
        onChange={(e) => {
          const sp = new URLSearchParams(searchParams.toString());
          sp.delete("cursor");
          sp.delete("back");
          if (e.target.value) {
            sp.set(name, e.target.value);
          } else {
            sp.delete(name);
          }
          const qs = sp.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
        className="block min-h-11 rounded-control border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-ink focus:border-focus focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-focus/15"
      >
        <option value="">{allLabel}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Input date que escribe su param en la URL al cambiar. */
export function FilterDate({
  name,
  label,
}: {
  name: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(name) ?? "";

  return (
    <div>
      <label
        htmlFor={`filter-${name}`}
        className="mb-1 block text-[13px] font-semibold text-text-secondary-strong"
      >
        {label}
      </label>
      <input
        id={`filter-${name}`}
        type="date"
        value={current}
        onChange={(e) => {
          const sp = new URLSearchParams(searchParams.toString());
          sp.delete("cursor");
          sp.delete("back");
          if (e.target.value) {
            sp.set(name, e.target.value);
          } else {
            sp.delete(name);
          }
          const qs = sp.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
        className="block min-h-11 rounded-control border border-border-subtle bg-surface-elevated px-3 py-2 text-sm text-ink focus:border-focus focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-focus/15"
      />
    </div>
  );
}
