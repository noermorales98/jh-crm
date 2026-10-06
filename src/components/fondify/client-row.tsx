/**
 * Fondify ClientRow — fila de cliente en formato card (no tabla)
 * Similar a la UI de Fondify Agency
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusPill } from "./status-pill";

type ClientRowProps = {
  id: string;
  name: string;
  email: string;
  status: string;
  roundNumber?: number;
  reviewDate?: string;
  reportsCount: number;
  overdue?: boolean;
  className?: string;
};

export function ClientRow({
  id,
  name,
  email,
  status,
  roundNumber,
  reviewDate,
  reportsCount,
  overdue,
  className = "",
}: ClientRowProps) {
  const statusVariant =
    status === "ACTIVE"
      ? "ready"
      : status === "LEAD"
        ? "struct"
        : status === "PAUSED"
          ? "repair"
          : "neutral";

  const statusLabel =
    status === "ACTIVE"
      ? "ACTIVO"
      : status === "LEAD"
        ? "PROSPECTO"
        : status === "PAUSED"
          ? "PAUSADO"
          : status;

  return (
    <Link
      href={`/crm/clientes/${id}`}
      className={`group block rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-4 transition-colors hover:bg-[var(--ff-primary-tint)] ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[var(--ff-text)]">{name}</span>
            <StatusPill variant={statusVariant}>{statusLabel}</StatusPill>
            {roundNumber && (
              <StatusPill variant="round">RONDA {roundNumber}</StatusPill>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[var(--ff-fs-sm)]">
            <span className="text-[var(--ff-text-muted)]">{email}</span>
            {reviewDate && (
              <>
                <span className="text-[var(--ff-text-muted)]">·</span>
                <span
                  className={
                    overdue
                      ? "text-[var(--ff-orange-review)] font-medium"
                      : "text-[var(--ff-text-secondary)]"
                  }
                >
                  Revisar en {reviewDate}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-[var(--ff-fs-xs)] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-muted)]">
              REPORTES
            </p>
            <p className="text-[var(--ff-fs-lg)] font-bold tabular-nums text-[var(--ff-text)]">
              {reportsCount}
            </p>
          </div>
          <ChevronRight
            className="size-5 text-[var(--ff-text-secondary)] transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.75}
          />
        </div>
      </div>
    </Link>
  );
}
