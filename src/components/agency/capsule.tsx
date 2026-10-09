import type { ReactNode } from "react";
import type { ClientStatus } from "@prisma/client";
import {
  FONDIFY_BUCKET_LABELS,
  mapClientToFondifyStatus,
  type FondifyBucket,
} from "@/src/lib/fondify/status";
import type { CreditQualificationKind } from "@/src/lib/credit/qualification";

/**
 * Cápsula HIG: fill suave, sin borde ni ring.
 * color.md › Liquid Glass / Best practices — color con mesura; el estado
 * se comunica con fill + texto, no con outlines.
 */
export function Capsule({
  children,
  tone = "neutral",
  size = "sm",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger" | "warning" | "success";
  size?: "sm" | "md";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-nav-hover text-text-secondary-strong",
    accent: "bg-nav-active text-action-primary",
    danger: "bg-danger-soft text-danger-ink",
    warning: "bg-warning-soft text-warning-ink",
    success: "bg-success-soft text-success-ink",
  };
  const sizes = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-[12px]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium tracking-[-0.01em] ${tones[tone]} ${sizes[size]}`}
    >
      {children}
    </span>
  );
}

const BUCKET_TONE: Record<FondifyBucket, "danger" | "warning" | "success"> = {
  repair: "danger",
  struct: "warning",
  ready: "success",
};

export function FondifyStatusCapsule({ status }: { status: ClientStatus }) {
  const bucket = mapClientToFondifyStatus(status);
  if (!bucket) {
    return <Capsule tone="neutral">{status}</Capsule>;
  }
  return (
    <Capsule tone={BUCKET_TONE[bucket]}>{FONDIFY_BUCKET_LABELS[bucket]}</Capsule>
  );
}

const QUAL_TONE: Record<
  CreditQualificationKind,
  "neutral" | "warning" | "accent"
> = {
  sin_datos: "neutral",
  revision: "warning",
  heuristica: "accent",
};

/** Calificación crediticia (reporte), no pipeline comercial. */
export function CreditQualificationCapsule({
  kind,
  label,
}: {
  kind: CreditQualificationKind;
  label: string;
}) {
  return <Capsule tone={QUAL_TONE[kind]}>{label}</Capsule>;
}
