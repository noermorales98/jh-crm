import type { PillTone } from "@/src/components/ui";
import { OPPORTUNITY_STAGES } from "@/src/lib/validation/opportunities";

/** Tema visual por etapa (HIG: color comunica significado, no decoración). */
export type StageTheme = {
  /** Fondo de columna / sección */
  column: string;
  /** Barra / punto del timeline de progreso */
  dot: string;
  /** Texto de acento en encabezado */
  accent: string;
  /** Avatar wrap + icon */
  avatarWrap: string;
  avatarIcon: string;
  /** Pill tone asociado */
  pill: PillTone;
  /** Anillo de drop target */
  dropRing: string;
};

export const STAGE_THEME: Record<string, StageTheme> = {
  NEW_LEAD: {
    column: "bg-purple-soft/70 ring-purple-ink/15",
    dot: "bg-purple-ink",
    accent: "text-purple-ink",
    avatarWrap: "bg-purple-soft ring-purple-ink/20",
    avatarIcon: "text-purple-ink",
    pill: "purple",
    dropRing: "ring-purple-ink/40",
  },
  CONTACTED: {
    column: "bg-info-soft/70 ring-info-ink/15",
    dot: "bg-info-ink",
    accent: "text-info-ink",
    avatarWrap: "bg-info-soft ring-info-ink/20",
    avatarIcon: "text-info-ink",
    pill: "blue",
    dropRing: "ring-info-ink/40",
  },
  CONSULTATION: {
    column: "bg-warning-soft/80 ring-warning-ink/15",
    dot: "bg-warning-ink",
    accent: "text-warning-ink",
    avatarWrap: "bg-warning-soft ring-warning-ink/20",
    avatarIcon: "text-warning-ink",
    pill: "amber",
    dropRing: "ring-warning-ink/40",
  },
  INTAKE_SENT: {
    column: "bg-nav-active/80 ring-action-primary/20",
    dot: "bg-action-primary",
    accent: "text-action-primary",
    avatarWrap: "bg-nav-active ring-action-primary/25",
    avatarIcon: "text-action-primary",
    pill: "indigo",
    dropRing: "ring-action-primary/40",
  },
  INTAKE_COMPLETED: {
    column: "bg-nav-active ring-action-primary/30",
    dot: "bg-action-secondary",
    accent: "text-action-secondary",
    avatarWrap: "bg-nav-active ring-action-primary/30",
    avatarIcon: "text-action-secondary",
    pill: "indigo",
    dropRing: "ring-action-primary/45",
  },
  PROPOSAL: {
    column: "bg-success-soft/70 ring-success-ink/15",
    dot: "bg-success-ink",
    accent: "text-success-ink",
    avatarWrap: "bg-success-soft ring-success-ink/20",
    avatarIcon: "text-success-ink",
    pill: "green",
    dropRing: "ring-success-ink/40",
  },
  WAITING_PAYMENT: {
    column: "bg-warning-soft/90 ring-warning-ink/25",
    dot: "bg-warning-ink",
    accent: "text-warning-ink",
    avatarWrap: "bg-warning-soft ring-warning-ink/25",
    avatarIcon: "text-warning-ink",
    pill: "amber",
    dropRing: "ring-warning-ink/45",
  },
  WON: {
    column: "bg-success-soft ring-success-ink/25",
    dot: "bg-success-ink",
    accent: "text-success-ink",
    avatarWrap: "bg-success-soft ring-success-ink/25",
    avatarIcon: "text-success-ink",
    pill: "green",
    dropRing: "ring-success-ink/50",
  },
  LOST: {
    column: "bg-danger-soft/80 ring-danger-ink/15",
    dot: "bg-danger-ink",
    accent: "text-danger-ink",
    avatarWrap: "bg-danger-soft ring-danger-ink/20",
    avatarIcon: "text-danger-ink",
    pill: "red",
    dropRing: "ring-danger-ink/40",
  },
};

export function stageTheme(stage: string): StageTheme {
  return (
    STAGE_THEME[stage] ?? {
      column: "bg-surface-app ring-border-subtle/40",
      dot: "bg-text-secondary",
      accent: "text-text-secondary",
      avatarWrap: "bg-surface-panel ring-border-subtle",
      avatarIcon: "text-text-secondary",
      pill: "slate",
      dropRing: "ring-border-subtle",
    }
  );
}

export const PIPELINE_STAGES = OPPORTUNITY_STAGES;

export type LeadsViewMode = "kanban" | "list" | "timeline";

export const LEADS_VIEW_STORAGE_KEY = "jh-leads-view";
export const LEADS_VIEW_COOKIE = "jh-leads-view";

const VIEW_LISTENERS = new Set<() => void>();

function isLeadsViewMode(value: string | null | undefined): value is LeadsViewMode {
  return value === "kanban" || value === "list" || value === "timeline";
}

function readViewCookie(): LeadsViewMode | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LEADS_VIEW_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.split("=").slice(1).join("="));
  return isLeadsViewMode(value) ? value : null;
}

/** Vista guardada en caché local (localStorage + cookie). */
export function getStoredLeadsView(): LeadsViewMode {
  if (typeof window === "undefined") return "kanban";
  try {
    const fromStorage = window.localStorage.getItem(LEADS_VIEW_STORAGE_KEY);
    if (isLeadsViewMode(fromStorage)) return fromStorage;
  } catch {
    /* ignore */
  }
  return readViewCookie() ?? "kanban";
}

export function setStoredLeadsView(view: LeadsViewMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEADS_VIEW_STORAGE_KEY, view);
  } catch {
    /* ignore */
  }
  try {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${LEADS_VIEW_COOKIE}=${encodeURIComponent(view)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
  VIEW_LISTENERS.forEach((listener) => listener());
}

export function subscribeStoredLeadsView(listener: () => void) {
  VIEW_LISTENERS.add(listener);
  return () => {
    VIEW_LISTENERS.delete(listener);
  };
}