import type { ReactNode } from "react";

export function FondifyKpiCard({
  kicker,
  value,
  hint,
  iconClass,
  icon: Icon,
}: {
  kicker: string;
  value: string | number;
  hint?: string;
  iconClass?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-5 shadow-[var(--ff-shadow-sm)] ring-1 ring-[var(--ff-border)]">
      {Icon && (
        <div className={`mb-4 flex size-10 items-center justify-center rounded-xl ${iconClass}`}>
          {Icon}
        </div>
      )}
      <div className="ff-kicker mb-2">{kicker}</div>
      <div className="text-[var(--ff-fs-2xl)] font-bold leading-none tracking-[-0.03em] tabular-nums text-[var(--ff-text)]">
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-[11px] text-[var(--ff-text-secondary)]">{hint}</div>
      )}
    </div>
  );
}
