/**
 * Fondify Action Center — panel de acciones y herramientas para cliente
 * Inspirado en el Action Center de Fondify Agency
 */

import Link from "next/link";
import { FileText, ClipboardCheck, TrendingUp, Target, DollarSign, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ActionTile = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: "NUEVO" | "BETA";
  available?: boolean;
};

type ActionCenterProps = {
  clientId: string;
  className?: string;
};

const ANALYSIS_TOOLS: ActionTile[] = [
  {
    id: "credit-report",
    label: "Reporte de crédito",
    href: "#",
    icon: FileText,
    available: true,
  },
  {
    id: "action-plan",
    label: "Plan de Acción",
    href: "#",
    icon: ClipboardCheck,
    badge: "NUEVO",
    available: true,
  },
  {
    id: "analysis",
    label: "Análisis",
    href: "#",
    icon: TrendingUp,
    badge: "BETA",
    available: true,
  },
  {
    id: "score-plan",
    label: "Score Plan",
    href: "#",
    icon: Target,
    badge: "BETA",
    available: true,
  },
  {
    id: "fondeo",
    label: "Fondeo",
    href: "#",
    icon: DollarSign,
    available: true,
  },
  {
    id: "avance",
    label: "Avance",
    href: "#",
    icon: ArrowRight,
    badge: "BETA",
    available: true,
  },
];

export function ActionCenter({ clientId, className = "" }: ActionCenterProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      <section>
        <h3 className="mb-3 text-[var(--ff-fs-sm)] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-muted)]">
          1 · Analiza y muestra el valor
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ANALYSIS_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.id}
                href={tool.href}
                className={`group relative overflow-hidden rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-4 shadow-[var(--ff-shadow-sm)] transition-all hover:shadow-[var(--ff-shadow-md)] ${
                  !tool.available ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ff-primary-soft)]">
                    <Icon className="size-5 text-[var(--ff-primary)]" strokeWidth={1.75} />
                  </div>
                  {tool.badge && (
                    <span
                      className={`px-2 py-0.5 rounded-[var(--ff-radius-sm)] text-[10px] font-bold uppercase tracking-wider ${
                        tool.badge === "NUEVO"
                          ? "bg-[var(--ff-primary)] text-white"
                          : "bg-[var(--ff-warning-bg)] text-[var(--ff-warning-fg)]"
                      }`}
                    >
                      {tool.badge}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[var(--ff-fs-base)] font-medium text-[var(--ff-text)] group-hover:text-[var(--ff-primary)]">
                  {tool.label}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-[var(--ff-fs-sm)] font-semibold uppercase tracking-[0.06em] text-[var(--ff-text-muted)]">
          2 · Cierra la venta
        </h3>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { id: "quote", label: "Cotización", status: "Sin enviar" },
              { id: "contract", label: "Contrato", status: "Borrador" },
              { id: "onboarding", label: "Formulario de Iniciación", status: "Sin llenar" },
            ].map((item) => (
              <div
                key={item.id}
                className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-surface)] p-4 shadow-[var(--ff-shadow-sm)]"
              >
                <div className="flex items-start gap-2">
                  <FileText className="size-5 shrink-0 text-[var(--ff-primary)]" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--ff-text)]">{item.label}</p>
                    <p className="mt-0.5 text-[var(--ff-fs-sm)] text-[var(--ff-warning-fg)]">
                      {item.status}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-primary-soft)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[var(--ff-fs-base)] font-semibold text-[var(--ff-text)]">
                  Envía la cotización
                </p>
                <p className="mt-1 text-[var(--ff-fs-sm)] text-[var(--ff-text-secondary)]">
                  Arma el paquete y mándalo al cliente para cerrar
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-[var(--ff-radius-md)] bg-[var(--ff-primary)] px-4 py-2 text-[var(--ff-fs-base)] font-semibold text-white transition-colors hover:bg-[var(--ff-primary-hover)]"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
