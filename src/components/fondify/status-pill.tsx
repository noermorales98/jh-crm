/**
 * Fondify StatusPill — pills de estado para clientes, rondas, etc.
 */

type StatusPillProps = {
  variant: "repair" | "ready" | "struct" | "round" | "neutral";
  children: React.ReactNode;
  className?: string;
};

export function StatusPill({ variant, children, className = "" }: StatusPillProps) {
  const variantStyles = {
    repair: "bg-[var(--ff-status-repair-bg)] text-[var(--ff-status-repair-fg)]",
    ready: "bg-[var(--ff-status-ready-bg)] text-[var(--ff-status-ready-fg)]",
    struct: "bg-[var(--ff-status-struct-bg)] text-[var(--ff-status-struct-fg)]",
    round: "bg-[var(--ff-status-round-bg)] text-[var(--ff-status-round-fg)]",
    neutral: "bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[var(--ff-radius-sm)] text-[var(--ff-fs-xs)] font-semibold uppercase tracking-[0.06em] ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
