import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ClientStatus } from "@prisma/client";
import {
  daysUntil,
  isReviewSoon,
  reviewInLabel,
} from "@/src/lib/fondify/status";
import { Capsule, FondifyStatusCapsule } from "@/src/components/agency/capsule";
import { CREDIT_SEGMENTS, CREDIT_SEGMENT_SHORT, type CreditSegment } from "@/src/lib/credit/segments";
import { cityStateLabel } from "@/src/lib/us-states";

export { FondifyStatusCapsule as FondifyStatusPill };

export function ClientRowCard({
  id,
  name,
  email,
  phone = null,
  city = null,
  state = null,
  status,
  roundNumber,
  nextActionAt,
  reportsCount,
  creditSegment,
  stale = false,
  isLast = false,
}: {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  city?: string | null;
  /** Estado donde vive (código de 2 letras). */
  state?: string | null;
  status: ClientStatus;
  roundNumber: number | null;
  nextActionAt: Date | null;
  reportsCount: number;
  /** Calificación por el último reporte (opcional). */
  creditSegment?: CreditSegment;
  stale?: boolean;
  isLast?: boolean;
}) {
  const days = nextActionAt ? daysUntil(nextActionAt) : null;
  const soon = days != null && isReviewSoon(days);
  const place = cityStateLabel(city, state);
  const contact = [email ?? "Sin correo", phone].filter(Boolean).join(" · ");

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
            {roundNumber != null ? `Ronda ${roundNumber}` : "Sin ronda"}
          </Capsule>
          {creditSegment ? (
            <Capsule tone={CREDIT_SEGMENTS.find((s) => s.id === creditSegment)?.tone ?? "neutral"}>
              {CREDIT_SEGMENT_SHORT[creditSegment]}
            </Capsule>
          ) : null}
          {stale ? <Capsule tone="warning">Toca actualizar</Capsule> : null}
        </div>
        <p className="mt-1 truncate text-[13px] text-text-secondary">
          {place ? <span className="font-medium text-ink">{place}</span> : <span>Sin estado</span>}
          {" · "}
          {contact}
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
