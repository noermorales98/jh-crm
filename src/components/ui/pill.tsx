import {
  CLIENT_STATUS_LABELS,
  CASE_STATE_LABELS,
  ROUND_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_TYPE_LABELS,
  QUOTE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  labelFor,
} from "@/src/lib/labels";

/**
 * StatusPill: insignia de estado con mapa de colores por dominio.
 * Usar <StatusPill domain="case" value={case.state} />.
 * Para un pill libre: <Pill tone="green">Texto</Pill>.
 */

export type PillTone =
  | "slate"
  | "indigo"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "purple";

const TONE_CLASSES: Record<PillTone, string> = {
  slate: "bg-surface-panel text-text-secondary-strong ring-border-subtle",
  indigo: "bg-nav-active text-action-primary ring-action-primary/20",
  blue: "bg-info-soft text-info-ink ring-info-ink/20",
  green: "bg-success-soft text-success-ink ring-success-ink/20",
  amber: "bg-warning-soft text-warning-ink ring-warning-ink/20",
  red: "bg-danger-soft text-danger-ink ring-danger-ink/20",
  purple: "bg-purple-soft text-purple-ink ring-purple-ink/20",
};

export function Pill({
  tone = "slate",
  children,
}: {
  tone?: PillTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export type PillDomain =
  | "client"
  | "case"
  | "round"
  | "taskStatus"
  | "taskPriority"
  | "quote"
  | "payment";

const DOMAIN_LABELS: Record<PillDomain, Record<string, string>> = {
  client: CLIENT_STATUS_LABELS,
  case: CASE_STATE_LABELS,
  round: ROUND_STATUS_LABELS,
  taskStatus: TASK_STATUS_LABELS,
  taskPriority: TASK_PRIORITY_LABELS,
  quote: QUOTE_STATUS_LABELS,
  payment: PAYMENT_STATUS_LABELS,
};

const DOMAIN_TONES: Record<PillDomain, Record<string, PillTone>> = {
  client: {
    LEAD: "blue",
    ACTIVE: "green",
    PAUSED: "amber",
    COMPLETED: "indigo",
    CANCELLED: "slate",
    ARCHIVED: "slate",
  },
  case: {
    OPEN: "green",
    PAUSED: "amber",
    COMPLETED: "indigo",
    CANCELLED: "slate",
  },
  round: {
    DRAFT: "slate",
    PREPARING: "blue",
    SENT: "indigo",
    WAITING_UPDATE: "amber",
    REVIEWING: "purple",
    COMPLETED: "green",
    CANCELLED: "slate",
  },
  taskStatus: {
    PENDING: "amber",
    IN_PROGRESS: "blue",
    COMPLETED: "green",
    CANCELLED: "slate",
  },
  taskPriority: {
    LOW: "slate",
    NORMAL: "blue",
    HIGH: "amber",
    URGENT: "red",
  },
  quote: {
    DRAFT: "slate",
    SENT: "blue",
    ACCEPTED: "green",
    REJECTED: "red",
    EXPIRED: "amber",
    PARTIAL: "purple",
    PAID: "green",
    CANCELLED: "slate",
  },
  payment: {
    PENDING: "amber",
    RECEIVED: "green",
    CANCELLED: "slate",
    REFUNDED: "purple",
  },
};

export function StatusPill({
  domain,
  value,
}: {
  domain: PillDomain;
  value: string;
}) {
  const tone = DOMAIN_TONES[domain][value] ?? "slate";
  return <Pill tone={tone}>{labelFor(DOMAIN_LABELS[domain], value)}</Pill>;
}

/** Pill coloreada con el color hex de una WorkflowStage. */
export function StagePill({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-panel px-2 py-0.5 text-[11px] font-medium text-text-secondary-strong ring-1 ring-inset ring-border-subtle"
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}

export { TASK_TYPE_LABELS };
