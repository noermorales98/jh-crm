import type { ClientStatus } from "@prisma/client";

type StatusPillProps = {
  status: ClientStatus;
};

const STATUS_CONFIG = {
  LEAD: {
    bg: "var(--ff-status-neutral-bg)",
    fg: "var(--ff-status-neutral-fg)",
    border: "var(--ff-status-neutral-border)",
    label: "PROSPECTO",
  },
  ACTIVE: {
    bg: "var(--ff-status-round-bg)",
    fg: "var(--ff-status-round-fg)",
    border: "var(--ff-status-round-border)",
    label: "ACTIVO",
  },
  PAUSED: {
    bg: "var(--ff-status-struct-bg)",
    fg: "var(--ff-status-struct-fg)",
    border: "var(--ff-status-struct-border)",
    label: "PAUSADO",
  },
  COMPLETED: {
    bg: "var(--ff-status-ready-bg)",
    fg: "var(--ff-status-ready-fg)",
    border: "var(--ff-status-ready-border)",
    label: "COMPLETADO",
  },
  CANCELLED: {
    bg: "var(--ff-status-repair-bg)",
    fg: "var(--ff-status-repair-fg)",
    border: "var(--ff-status-repair-border)",
    label: "CANCELADO",
  },
  ARCHIVED: {
    bg: "var(--ff-status-neutral-bg)",
    fg: "var(--ff-status-neutral-fg)",
    border: "var(--ff-status-neutral-border)",
    label: "ARCHIVADO",
  },
} as const;

export function FondifyStatusPill({ status }: StatusPillProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className="inline-flex items-center rounded-[var(--ff-radius-sm)] px-2 py-0.5 text-[var(--ff-fs-xs)] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: config.bg,
        color: config.fg,
        border: `1px solid ${config.border}`,
      }}
    >
      {config.label}
    </span>
  );
}

export function FondifyRoundPill({ roundNumber }: { roundNumber: number }) {
  return (
    <span
      className="inline-flex items-center rounded-[var(--ff-radius-sm)] px-2 py-0.5 text-[var(--ff-fs-xs)] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: "var(--ff-status-round-bg)",
        color: "var(--ff-status-round-fg)",
        border: "1px solid var(--ff-status-round-border)",
      }}
    >
      RONDA {roundNumber}
    </span>
  );
}
