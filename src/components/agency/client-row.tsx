import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ClientStatus } from "@prisma/client";
import {
  daysUntil,
  isReviewSoon,
  reviewInLabel,
} from "@/src/lib/fondify/status";
import { Capsule, FondifyStatusCapsule } from "@/src/components/agency/capsule";

export { FondifyStatusCapsule as FondifyStatusPill };

export function ClientRowCard({
  id,
  name,
  email,
  status,
  roundNumber,
  nextActionAt,
  reportsCount,
  isLast = false,
}: {
  id: string;
  name: string;
  email: string | null;
  status: ClientStatus;
  roundNumber: number | null;
  nextActionAt: Date | null;
  reportsCount: number;
  isLast?: boolean;
}) {
  const days = nextActionAt ? daysUntil(nextActionAt) : null;
  const soon = days != null && isReviewSoon(days);

  return (
    <Link
      href={`/crm/clientes/${id}`}
      className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-nav-hover ${
        isLast ? "" : "border-border-subtle/60 border-b"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
            {name}
          </span>
          <FondifyStatusCapsule status={status} />
          <Capsule tone="accent">
            {roundNumber != null ? `Ronda ${roundNumber}` : "Ronda —"}
          </Capsule>
        </div>
        <p className="mt-1 truncate text-[13px] text-text-secondary">
          {email ?? "Sin correo"}
          {days != null ? (
            <>
              {" · "}
              <span
                className={
                  soon ? "font-medium text-warning-ink" : undefined
                }
              >
                {reviewInLabel(days)}
              </span>
            </>
          ) : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] font-medium text-text-secondary">Reportes</p>
        <p className="text-[17px] font-semibold tabular-nums tracking-[-0.02em] text-ink">
          {reportsCount}
        </p>
      </div>
      <ChevronRight
        className="size-5 shrink-0 text-text-placeholder"
        aria-hidden
      />
    </Link>
  );
}
