"use client";

/**
 * Fondify FilterPills — pills de filtro con contador
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type FilterOption = {
  value: string;
  label: string;
  count?: number;
};

type FilterPillsProps = {
  name: string;
  options: FilterOption[];
  className?: string;
};

export function FilterPills({ name, options, className = "" }: FilterPillsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentValue = searchParams.get(name) ?? "";

  const handleSelect = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "") {
      params.delete(name);
    } else {
      params.set(name, value);
    }
    params.delete("cursor");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((option) => {
        const isActive = currentValue === option.value;
        const pillStyles = isActive
          ? "bg-[var(--ff-primary-soft)] text-[var(--ff-primary)] border-[var(--ff-primary)] border-2"
          : "bg-white text-[var(--ff-text-secondary)] border-[var(--ff-border)] border hover:bg-[var(--ff-primary-tint)]";

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--ff-radius-full)] text-[var(--ff-fs-xs)] font-semibold uppercase tracking-[0.06em] transition-colors ${pillStyles}`}
          >
            <span>{option.label}</span>
            {option.count !== undefined && (
              <>
                <span>·</span>
                <span className="tabular-nums">{option.count}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
