"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Select } from "./select";
import { DateInput } from "./date-input";

/**
 * FilterBar: contenedor horizontal de filtros.
 * FilterSelect / FilterDate: pickers en popup (Confirmar/Cancelar).
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
        className="mb-1 block text-[12px] font-medium text-text-secondary"
      >
        {label}
      </label>
      <Select
        id={`filter-${name}`}
        pickerTitle={label}
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
        options={[
          { value: "", label: allLabel },
          ...options.map((opt) => ({ value: opt.value, label: opt.label })),
        ]}
      />
    </div>
  );
}

/** Filtro de fecha con calendario popup. */
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
        className="mb-1 block text-[12px] font-medium text-text-secondary"
      >
        {label}
      </label>
      <DateInput
        id={`filter-${name}`}
        pickerTitle={label}
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
      />
    </div>
  );
}
