import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ClientStatus } from "@prisma/client";
import {
  FONDIFY_BUCKET_LABELS,
  daysUntil,
  isReviewSoon,
  mapClientToFondifyStatus,
  reviewInLabel,
} from "@/src/lib/fondify/status";

const BUCKET_PILL: Record<string, string> = {
  repair: "bg-danger-soft text-danger border-danger/30",
  struct: "bg-warning-soft text-warning-ink border-warning/30",
  ready: "bg-success-soft text-success-ink border-success/30",
};

export function FondifyStatusPill({ status }: { status: ClientStatus }) {
  const bucket = mapClientToFondifyStatus(status);
  if (!bucket) {
    return (
      <span className="inline-flex rounded-full border border-border-subtle bg-nav-hover px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        {status}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BUCKET_PILL[bucket]}`}
    >
      {FONDIFY_BUCKET_LABELS[bucket]}
    </span>
  );
}

export function ClientRowCard({
  id,
  name,
  email,
  status,
  roundNumber,
  nextActionAt,
  reportsCount,
}: {
  id: string;
  name: string;
  email: string | null;
  status: ClientStatus;
  roundNumber: number | null;
  nextActionAt: Date | null;
  reportsCount: number;
}) {
  const days = nextActionAt ? daysUntil(nextActionAt) : null;
  const soon = days != null && isReviewSoon(days);

  return (
    <Link
      href={`/crm/clientes/${id}`}
      className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-panel px-4 py-3 transition-colors hover:bg-nav-hover"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-ink">
            {name}
          </span>
          <FondifyStatusPill status={status} />
          <span className="inline-flex rounded-full border border-border-subtle bg-surface-app px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-action-primary">
            {roundNumber != null ? `Ronda ${roundNumber}` : "Ronda —"}
          </span>
        </div>
        <p className="mt-1 truncate text-[13px] text-text-secondary">
          {email ?? "Sin correo"}
          {days != null ? (
            <>
              {" · "}
              <span className={soon ? "font-medium text-warning-ink" : undefined}>
                {reviewInLabel(days)}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
          Reportes
        </p>
        <p className="text-[18px] font-bold tabular-nums text-ink">
          {reportsCount}
        </p>
      </div>
      <ChevronRight
        className="size-5 shrink-0 text-text-secondary"
        aria-hidden
      />
    </Link>
  );
}
