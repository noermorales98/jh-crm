import type { PillTone } from "@/src/components/ui";

/** Categoría visual de un ActivityType (agrupa colores). */
export type ActivityCategory =
  | "lifecycle"
  | "document"
  | "round"
  | "task"
  | "commerce"
  | "credit"
  | "comms"
  | "portal"
  | "other";

/** Clave Lucide usada por el nodo de la timeline. */
export type ActivityIconName =
  | "sparkles"
  | "sticky-note"
  | "refresh-cw"
  | "map-pin"
  | "file-up"
  | "file-x"
  | "trash-2"
  | "orbit"
  | "send"
  | "circle-check"
  | "square-check"
  | "badge-check"
  | "briefcase"
  | "upload"
  | "banknote"
  | "receipt"
  | "calendar-days"
  | "messages-square"
  | "mail"
  | "inbox"
  | "line-chart"
  | "trending-up"
  | "swords"
  | "wrench"
  | "search"
  | "scan-search"
  | "pen-line"
  | "pencil"
  | "scroll-text"
  | "clipboard-list"
  | "sprout"
  | "compass"
  | "trophy"
  | "link"
  | "door-open"
  | "lock"
  | "file-text"
  | "pen-tool"
  | "circle";

export type ActivityVisual = {
  category: ActivityCategory;
  icon: ActivityIconName;
  tone: PillTone;
  /** Fondo suave del nodo. */
  nodeClass: string;
  /** Color intenso del icono (misma categoría, más saturado). */
  iconClass: string;
  /** Color de acento de la tarjeta. */
  accentClass: string;
  label: string;
};

const CATEGORY_STYLE: Record<
  ActivityCategory,
  Pick<ActivityVisual, "tone" | "nodeClass" | "iconClass" | "accentClass" | "label">
> = {
  lifecycle: {
    tone: "indigo",
    nodeClass: "bg-nav-active ring-action-primary/20",
    iconClass: "text-action-primary",
    accentClass: "border-action-primary/35",
    label: "Ciclo de vida",
  },
  document: {
    tone: "blue",
    nodeClass: "bg-info-soft ring-info-ink/20",
    iconClass: "text-info-ink",
    accentClass: "border-info-ink/30",
    label: "Documentos",
  },
  round: {
    tone: "amber",
    nodeClass: "bg-warning-soft ring-warning-ink/20",
    iconClass: "text-warning-ink",
    accentClass: "border-warning-ink/30",
    label: "Rondas",
  },
  task: {
    tone: "purple",
    nodeClass: "bg-purple-soft ring-purple-ink/20",
    iconClass: "text-purple-ink",
    accentClass: "border-purple-ink/30",
    label: "Tareas",
  },
  commerce: {
    tone: "green",
    nodeClass: "bg-success-soft ring-success-ink/20",
    iconClass: "text-success-ink",
    accentClass: "border-success-ink/30",
    label: "Cobros",
  },
  credit: {
    tone: "blue",
    nodeClass: "bg-info-soft ring-info-ink/25",
    iconClass: "text-info-ink",
    accentClass: "border-info-ink/35",
    label: "Crédito",
  },
  comms: {
    tone: "slate",
    nodeClass: "bg-surface-panel ring-border-subtle",
    iconClass: "text-text-secondary-strong",
    accentClass: "border-border-subtle",
    label: "Comunicación",
  },
  portal: {
    tone: "indigo",
    nodeClass: "bg-nav-active ring-action-primary/15",
    iconClass: "text-action-secondary",
    accentClass: "border-action-primary/25",
    label: "Portal / contratos",
  },
  other: {
    tone: "slate",
    nodeClass: "bg-surface-panel ring-border-subtle",
    iconClass: "text-text-secondary",
    accentClass: "border-border-subtle",
    label: "Otro",
  },
};

const TYPE_META: Record<
  string,
  { category: ActivityCategory; icon: ActivityIconName }
> = {
  CREATED: { category: "lifecycle", icon: "sparkles" },
  NOTE: { category: "lifecycle", icon: "sticky-note" },
  STATUS_CHANGE: { category: "lifecycle", icon: "refresh-cw" },
  STAGE_CHANGE: { category: "lifecycle", icon: "map-pin" },
  DOCUMENT_UPLOAD: { category: "document", icon: "file-up" },
  DOCUMENT_DELETE: { category: "document", icon: "file-x" },
  DOCUMENT_HARD_DELETED: { category: "document", icon: "trash-2" },
  ROUND_CREATED: { category: "round", icon: "orbit" },
  ROUND_SENT: { category: "round", icon: "send" },
  ROUND_REVIEWED: { category: "round", icon: "circle-check" },
  TASK_CREATED: { category: "task", icon: "square-check" },
  TASK_COMPLETED: { category: "task", icon: "badge-check" },
  QUOTE_CREATED: { category: "commerce", icon: "briefcase" },
  QUOTE_SENT: { category: "commerce", icon: "upload" },
  PAYMENT_RECORDED: { category: "commerce", icon: "banknote" },
  RECEIPT_CREATED: { category: "commerce", icon: "receipt" },
  PAYMENT_PLAN_CREATED: { category: "commerce", icon: "calendar-days" },
  CONSULTATION_REQUESTED: { category: "commerce", icon: "messages-square" },
  MAIL_SENT: { category: "comms", icon: "mail" },
  MAIL_RECEIVED: { category: "comms", icon: "inbox" },
  CREDIT_REPORT_CREATED: { category: "credit", icon: "line-chart" },
  CREDIT_REPORT_UPDATED: { category: "credit", icon: "trending-up" },
  DISPUTE_ITEM_ADDED: { category: "credit", icon: "swords" },
  DISPUTE_ITEM_UPDATED: { category: "credit", icon: "wrench" },
  COMPARISON_CREATED: { category: "credit", icon: "search" },
  COMPARISON_UPDATED: { category: "credit", icon: "scan-search" },
  LETTER_CREATED: { category: "credit", icon: "pen-line" },
  LETTER_UPDATED: { category: "credit", icon: "pencil" },
  LETTER_FINALIZED: { category: "credit", icon: "scroll-text" },
  PROGRESS_REPORT_GENERATED: { category: "credit", icon: "clipboard-list" },
  OPPORTUNITY_CREATED: { category: "lifecycle", icon: "sprout" },
  OPPORTUNITY_STAGE_CHANGED: { category: "lifecycle", icon: "compass" },
  OPPORTUNITY_WON: { category: "lifecycle", icon: "trophy" },
  PROCESSOR_LINKED: { category: "credit", icon: "link" },
  PORTAL_ACCESS_INVITED: { category: "portal", icon: "door-open" },
  PORTAL_ACCESS_REVOKED: { category: "portal", icon: "lock" },
  CONTRACT_CREATED: { category: "portal", icon: "file-text" },
  CONTRACT_SIGNED: { category: "portal", icon: "pen-tool" },
  OTHER: { category: "other", icon: "circle" },
};

export function getActivityVisual(type: string): ActivityVisual {
  const meta = TYPE_META[type] ?? TYPE_META.OTHER!;
  const style = CATEGORY_STYLE[meta.category];
  return {
    category: meta.category,
    icon: meta.icon,
    ...style,
  };
}

export type ActivityLinkTarget = {
  href: string;
  label: string;
};

function metaString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const v = (metadata as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Destinos relacionados según tipo + FKs del ActivityLog.
 */
export function resolveActivityLinks(event: {
  type: string;
  clientId: string;
  caseId?: string | null;
  roundId?: string | null;
  metadata?: unknown;
}): ActivityLinkTarget[] {
  const links: ActivityLinkTarget[] = [];
  const caseId = event.caseId;
  const roundId = event.roundId;
  const documentId = metaString(event.metadata, "documentId");
  const quoteId = metaString(event.metadata, "quoteId");
  const paymentId = metaString(event.metadata, "paymentId");
  const taskId = metaString(event.metadata, "taskId");
  const reportId = metaString(event.metadata, "reportId");

  const t = event.type;

  if (caseId) {
    links.push({ href: `/crm/casos/${caseId}`, label: "Ver caso" });
  }

  if (
    t.startsWith("ROUND_") ||
    t.startsWith("DISPUTE_") ||
    t.startsWith("LETTER_")
  ) {
    if (caseId && roundId) {
      links.push({
        href: `/crm/casos/${caseId}/rondas/${roundId}`,
        label: "Ver ronda",
      });
    } else if (caseId) {
      links.push({ href: `/crm/casos/${caseId}/rondas`, label: "Ver rondas" });
    }
  }

  if (
    t.startsWith("CREDIT_REPORT_") ||
    t.startsWith("COMPARISON_") ||
    t === "PROGRESS_REPORT_GENERATED" ||
    t === "PROCESSOR_LINKED"
  ) {
    if (caseId && reportId) {
      links.push({
        href: `/crm/casos/${caseId}/credito/reportes/${reportId}`,
        label: "Ver reporte",
      });
    } else if (caseId) {
      links.push({
        href: `/crm/casos/${caseId}/credito`,
        label: "Ver crédito",
      });
    }
  }

  if (t.startsWith("DOCUMENT_")) {
    links.push({
      href: `/crm/clientes/${event.clientId}/expediente`,
      label: "Ver expediente",
    });
    void documentId;
  }

  if (t.startsWith("TASK_")) {
    links.push({
      href: taskId ? `/crm/tareas?highlight=${taskId}` : "/crm/tareas",
      label: "Ver tareas",
    });
  }

  if (t.startsWith("QUOTE_")) {
    links.push({
      href: quoteId
        ? `/crm/cotizaciones/${quoteId}`
        : `/crm/cotizaciones?clientId=${event.clientId}`,
      label: "Ver cotizaciones",
    });
  }

  if (
    t === "PAYMENT_RECORDED" ||
    t === "RECEIPT_CREATED" ||
    t === "PAYMENT_PLAN_CREATED"
  ) {
    links.push({
      href: `/crm/pagos?clientId=${event.clientId}`,
      label: "Ver pagos",
    });
    void paymentId;
  }

  if (t.startsWith("MAIL_")) {
    links.push({ href: "/crm/mails", label: "Ver mensajes" });
  }

  if (
    t.startsWith("OPPORTUNITY_") ||
    t.startsWith("PORTAL_") ||
    t.startsWith("CONTRACT_")
  ) {
    links.push({
      href: `/crm/clientes/${event.clientId}`,
      label: "Ver cliente",
    });
  }

  if (
    t === "NOTE" ||
    t === "CREATED" ||
    t === "STATUS_CHANGE" ||
    t === "STAGE_CHANGE"
  ) {
    if (!caseId) {
      links.push({
        href: `/crm/clientes/${event.clientId}`,
        label: "Ver resumen",
      });
    }
  }

  const seen = new Set<string>();
  return links.filter((l) => {
    if (seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });
}
