/**
 * Fondify KPI Card — tarjeta de KPI con kicker, valor grande y subtexto
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type KpiCardProps = {
  kicker: string;
  value: string | number;
  subtitle?: string;
  href?: string;
  icon?: LucideIcon;
  variant?: "default" | "danger" | "primary" | "magenta";
  className?: string;
};

export function KpiCard({
  kicker,
  value,
  subtitle,
  href,
  icon: Icon,
  variant = "default",
  className = "",
}: KpiCardProps) {
  const valueColors = {
    default: "text-[var(--ff-text)]",
    danger: "text-[var(--color-danger)]",
    primary: "text-[var(--ff-primary)]",
    magenta: "text-[var(--ff-magenta)]",
  };

  const content = (
    <div className={`relative overflow-hidden rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-5 shadow-[var(--ff-shadow-sm)] ${href ? "hover:shadow-[var(--ff-shadow-md)] transition-shadow" : ""} ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[var(--ff-fs-xs)] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-muted)]">
            {kicker}
          </p>
          <p className={`mt-2 text-[var(--ff-fs-2xl)] font-bold tabular-nums ${valueColors[variant]}`}>
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-[var(--ff-fs-sm)] text-[var(--ff-text-secondary)]">
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ff-primary-soft)]">
            <Icon className="size-5 text-[var(--ff-primary)]" strokeWidth={1.75} />
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
