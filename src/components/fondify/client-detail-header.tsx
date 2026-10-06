/**
 * Fondify Client Detail Header — cabecera de detalle de cliente estilo Fondify
 */

import Link from "next/link";
import { ChevronLeft, FileText, Edit2, Link as LinkIcon, Trash2, Upload } from "lucide-react";
import { StatusPill } from "./status-pill";

type ClientDetailHeaderProps = {
  clientName: string;
  clientEmail: string;
  status: string;
  reportsCount: number;
  roundNumber?: number;
  reviewDate?: string;
  backHref?: string;
  className?: string;
};

export function ClientDetailHeader({
  clientName,
  clientEmail,
  status,
  reportsCount,
  roundNumber,
  reviewDate,
  backHref = "/crm/clientes",
  className = "",
}: ClientDetailHeaderProps) {
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
    <div className={`space-y-4 ${className}`}>
      <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-5 shadow-[var(--ff-shadow-sm)]">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Link
              href={backHref}
              className="flex items-center gap-1 text-[var(--ff-fs-sm)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-primary)]"
            >
              <ChevronLeft className="size-4" strokeWidth={2} />
              <span>Clientes</span>
            </Link>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[var(--ff-fs-xl)] font-bold text-[var(--ff-text)]">
                  {clientName}
                </h1>
                <StatusPill variant={statusVariant}>{statusLabel}</StatusPill>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[var(--ff-fs-sm)] text-[var(--ff-text-secondary)]">
                <span>{clientEmail}</span>
                <span>·</span>
                <span>{reportsCount} reportes</span>
                {roundNumber && (
                  <>
                    <StatusPill variant="round">RONDA {roundNumber}</StatusPill>
                  </>
                )}
                {reviewDate && (
                  <>
                    <span>·</span>
                    <span className="text-[var(--ff-orange-review)]">
                      Revisar en {reviewDate}
                    </span>
                  </>
                )}
              </div>
            </div>

            <Link
              href="#"
              className="flex items-center gap-1.5 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-primary)] hover:text-[var(--ff-primary-hover)]"
            >
              <span>Abrir centro de rondas</span>
              <ChevronLeft className="size-4 rotate-180" strokeWidth={2} />
            </Link>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] bg-white px-3 py-1.5 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text-secondary)] transition-colors hover:bg-[var(--ff-primary-tint)]"
            >
              <FileText className="size-4" strokeWidth={1.75} />
              <span>Documentos</span>
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--ff-primary-soft)] text-[10px] font-bold text-[var(--ff-primary)]">
                6
              </span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] bg-white px-3 py-1.5 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text-secondary)] transition-colors hover:bg-[var(--ff-primary-tint)]"
            >
              <Edit2 className="size-4" strokeWidth={1.75} />
              <span>Editar</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[var(--ff-radius-md)] border border-[var(--ff-border)] bg-white px-3 py-1.5 text-[var(--ff-fs-sm)] font-medium text-[var(--ff-text-secondary)] transition-colors hover:bg-[var(--ff-primary-tint)]"
            >
              <LinkIcon className="size-4" strokeWidth={1.75} />
              <span>Unir expedientes</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[var(--ff-radius-md)] border-2 border-[var(--color-danger)] bg-white px-3 py-1.5 text-[var(--ff-fs-sm)] font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-soft)]"
            >
              <Trash2 className="size-4" strokeWidth={1.75} />
              <span>Eliminar</span>
            </button>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-2 rounded-[var(--ff-radius-md)] bg-[var(--ff-primary)] px-4 py-1.5 text-[var(--ff-fs-sm)] font-semibold text-white transition-colors hover:bg-[var(--ff-primary-hover)]"
            >
              <Upload className="size-4" strokeWidth={2} />
              <span>Subir reporte</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
