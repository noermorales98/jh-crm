"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Merge,
  Copy,
  X,
  ListChecks,
  Search,
  TrendingUp,
  Calculator,
  GitCompare,
  Receipt,
  Scale,
  ClipboardList,
  Briefcase,
  CheckSquare,
  CreditCard,
  StickyNote,
  MessageSquareQuote,
  FileText,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { ClientStatus } from "@prisma/client";
import { Button } from "@/src/components/ui";
import { AgencyModal } from "@/src/components/agency/agency-modal";
import { Capsule, FondifyStatusCapsule } from "@/src/components/agency/capsule";
import { archiveClient, updateClient } from "@/src/actions/clients";
import {
  daysUntil,
  isReviewSoon,
  mapClientToFondifyStatus,
  reviewInLabel,
} from "@/src/lib/fondify/status";
import { ClientQuickAdd } from "@/src/components/clients/client-quick-add";
import type {
  ServiceOption,
  StageOption,
} from "@/src/components/cases/create-case-button";
import { CreateIntakeLinkCard } from "@/src/components/intake/create-intake-link-card";
import {
  ActivityTimeline,
  type TimelineEvent,
} from "@/src/components/clients/activity-timeline";

export type AgencyClientDetailProps = {
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    status: ClientStatus;
  };
  fullName: string;
  reportsCount: number;
  roundNumber: number | null;
  nextReviewAt: Date | null;
  caseId: string | null;
  documentsCount: number;
  kpis: {
    porArreglar: number;
    fondeoPotencial: string;
    asesoriaHoy: string;
  };
  quoteHref: string;
  contractHref: string;
  reportHref: string | null;
  avanceHref: string | null;
  intakeUrl: string | null;
  intakeEnabled: boolean;
  intakeCases: { id: string; caseCode: string }[];
  intakeLinks: {
    id: string;
    url: string;
    caseCode: string | null;
    maxUses: number;
    useCount: number;
    expiresAt: Date | string | null;
    usable: boolean;
    isActive: boolean;
  }[];
  canEdit: boolean;
  canIntake: boolean;
  salesScript: string;
  quickAdd: {
    members: { id: string; name: string }[];
    stages: StageOption[];
    services: ServiceOption[];
    canDocument: boolean;
    canPayment: boolean;
    canReport: boolean;
    canRound: boolean;
    canService: boolean;
  };
  activityEvents: TimelineEvent[];
  /** Paneles de operación (slots RSC) */
  opsPanels: {
    services: ReactNode;
    tasks: ReactNode;
    documents: ReactNode;
    payments: ReactNode;
    notes: ReactNode;
    testimonials: ReactNode | null;
    credit: ReactNode;
  };
};

type Panel =
  | null
  | "edit"
  | "delete"
  | "merge"
  | "plan"
  | "analisis"
  | "score"
  | "fondeo"
  | "script"
  | "services"
  | "tasks"
  | "documents"
  | "payments"
  | "notes"
  | "testimonials"
  | "credit"
  | "activity"
  | "more";

/** Chip horizontal (Ahora / Cierre): cápsula con icono + título. */
function ActionCapsule({
  title,
  subtitle,
  icon: Icon,
  badge,
  onClick,
  href,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  badge?: string;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "group flex min-w-[7.5rem] max-w-[10rem] shrink-0 flex-col items-center gap-1.5 rounded-[22px] bg-surface-panel px-3.5 py-3 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-surface-elevated active:bg-nav-hover sm:min-w-[8.25rem]";
  const body = (
    <>
      <span
        className="relative flex size-10 items-center justify-center rounded-full bg-action-primary/10 text-action-primary"
        aria-hidden
      >
        <Icon className="size-[18px]" strokeWidth={1.75} />
        {badge ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-action-primary px-1.5 py-px text-[9px] font-semibold leading-none text-action-primary-foreground">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="w-full">
        <span className="block truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[11px] leading-snug text-text-secondary">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/** Track horizontal de cápsulas (Ahora / Cierre / Expediente). */
function CapsuleGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 px-1 text-[12px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {children}
      </div>
    </div>
  );
}

function InlinePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-overlay flex flex-col bg-surface-app">
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-panel px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-action-primary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver
        </button>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-full hover:bg-nav-hover"
          aria-label="Cerrar"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

export function AgencyClientDetail(props: AgencyClientDetailProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [utilPct, setUtilPct] = useState(45);
  const [fondeoForm, setFondeoForm] = useState({
    business: "",
    months: "12",
    naics: "",
    cash: "",
  });
  const [fondeoResult, setFondeoResult] = useState<string | null>(null);

  const bucket = mapClientToFondifyStatus(props.client.status);
  const days = props.nextReviewAt ? daysUntil(props.nextReviewAt) : null;
  const soon = days != null && isReviewSoon(days);
  const showRepairBanner = bucket === "repair" && props.kpis.porArreglar > 0;

  const activityPreview = props.activityEvents.slice(0, 5);

  useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [moreOpen]);

  const scoreOrder = useMemo(() => {
    const base = Math.max(100, Math.round(5000 * (utilPct / 100)));
    return [
      { name: "Tarjeta principal", pct: Math.min(utilPct, 90), amount: base },
      {
        name: "Segunda línea",
        pct: Math.max(5, Math.round(utilPct * 0.6)),
        amount: Math.round(base * 0.55),
      },
      {
        name: "Tercera línea",
        pct: Math.max(3, Math.round(utilPct * 0.35)),
        amount: Math.round(base * 0.3),
      },
    ];
  }, [utilPct]);

  function onEdit(formData: FormData) {
    setError(null);
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    startTransition(async () => {
      const result = await updateClient(props.client.id, {
        firstName,
        lastName: lastName || undefined,
        email: email || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPanel(null);
      router.refresh();
    });
  }

  function onArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveClient(props.client.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/crm/clientes");
      router.refresh();
    });
  }

  async function copyScript() {
    await navigator.clipboard.writeText(props.salesScript);
  }

  async function copyIntake() {
    if (!props.intakeUrl) return;
    await navigator.clipboard.writeText(props.intakeUrl);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-surface bg-surface-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">
                {props.fullName}
              </h1>
              <FondifyStatusCapsule status={props.client.status} />
            </div>
            <p className="mt-1 text-[13px] text-text-secondary">
              {props.client.email ?? "Sin correo"}
              {props.documentsCount > 0
                ? ` · ${props.documentsCount} docs`
                : null}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
              <Capsule tone="accent">
                {props.roundNumber != null
                  ? `Ronda ${props.roundNumber}`
                  : "Ronda —"}
              </Capsule>
              {days != null ? (
                <span
                  className={
                    soon
                      ? "font-medium text-warning-ink"
                      : "text-text-secondary"
                  }
                >
                  {reviewInLabel(days)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div ref={moreRef} className="relative">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                aria-label="Más acciones"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
              {moreOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-1 min-w-[11rem] overflow-hidden rounded-control border border-border-subtle bg-surface-panel py-1 shadow-lg"
                >
                  {props.canEdit ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-nav-hover"
                      onClick={() => {
                        setMoreOpen(false);
                        setPanel("edit");
                      }}
                    >
                      <Pencil className="size-3.5 text-text-secondary" aria-hidden />
                      Editar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-nav-hover"
                    onClick={() => {
                      setMoreOpen(false);
                      setPanel("merge");
                    }}
                  >
                    <Merge className="size-3.5 text-text-secondary" aria-hidden />
                    Unir expedientes
                  </button>
                  {props.canEdit ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-danger-ink hover:bg-nav-hover"
                      onClick={() => {
                        setMoreOpen(false);
                        setPanel("delete");
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Eliminar
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <ClientQuickAdd
              clientId={props.client.id}
              caseId={props.caseId}
              members={props.quickAdd.members}
              stages={props.quickAdd.stages}
              services={props.quickAdd.services}
              intakeCases={props.intakeCases}
              intakeLinks={props.intakeLinks}
              intakeEnabled={props.intakeEnabled}
              canDocument={props.quickAdd.canDocument}
              canPayment={props.quickAdd.canPayment}
              canReport={props.quickAdd.canReport}
              canRound={props.quickAdd.canRound}
              canService={props.quickAdd.canService}
              canIntake={props.canIntake}
            />
          </div>
        </div>

        <div
          className="mt-3 grid grid-cols-3 gap-2 border-t border-border-subtle/70 pt-3"
          role="group"
          aria-label="Indicadores del cliente"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium leading-none text-text-secondary">
              Por arreglar
            </p>
            <p className="mt-1 truncate text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-danger-ink">
              {props.kpis.porArreglar}
            </p>
          </div>
          <div className="min-w-0 border-l border-border-subtle/70 pl-3 sm:pl-4">
            <p className="text-[11px] font-medium leading-none text-text-secondary">
              Fondeo
            </p>
            <p className="mt-1 truncate text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
              {props.kpis.fondeoPotencial}
            </p>
          </div>
          <div className="min-w-0 border-l border-border-subtle/70 pl-3 sm:pl-4">
            <p className="text-[11px] font-medium leading-none text-text-secondary">
              Asesoría
            </p>
            <p className="mt-1 truncate text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-action-primary">
              {props.kpis.asesoriaHoy}
            </p>
          </div>
        </div>
      </div>

      {showRepairBanner ? (
        <div className="rounded-surface bg-warning-soft px-4 py-3 text-[13px] text-warning-ink">
          <strong>Gran oportunidad de reparación.</strong> Este cliente tiene{" "}
          {props.kpis.porArreglar} cuenta
          {props.kpis.porArreglar === 1 ? "" : "s"} negativa
          {props.kpis.porArreglar === 1 ? "" : "s"} que bloquean fondeo.
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
          Action Center
        </h2>

        <CapsuleGroup label="Ahora">
          <ActionCapsule
            icon={ListChecks}
            title="Plan de Acción"
            subtitle="Pasos a dar"
            badge="Nuevo"
            onClick={() => setPanel("plan")}
          />
          <ActionCapsule
            icon={Search}
            title="Análisis"
            subtitle={
              props.kpis.porArreglar > 0
                ? `${props.kpis.porArreglar} negativos`
                : "Negativos"
            }
            onClick={() => setPanel("analisis")}
          />
          <ActionCapsule
            icon={TrendingUp}
            title="Score Plan"
            subtitle="Sube el puntaje"
            onClick={() => setPanel("score")}
          />
          <ActionCapsule
            icon={Calculator}
            title="Fondeo"
            subtitle="Estimado"
            onClick={() => setPanel("fondeo")}
          />
          <ActionCapsule
            icon={GitCompare}
            title="Crédito"
            subtitle={
              props.roundNumber != null
                ? `Ronda ${props.roundNumber}`
                : `${props.reportsCount} reportes`
            }
            onClick={() => setPanel("credit")}
          />
        </CapsuleGroup>

        <CapsuleGroup label="Cierre">
          <ActionCapsule
            icon={Receipt}
            title="Cotización"
            subtitle="Propuesta"
            href={props.quoteHref}
          />
          <ActionCapsule
            icon={Scale}
            title="Contrato"
            subtitle="Firma"
            href={props.contractHref}
          />
          <ActionCapsule
            icon={ClipboardList}
            title="Iniciación"
            subtitle={
              props.intakeUrl
                ? "Copiar enlace"
                : props.intakeEnabled
                  ? "Generar"
                  : "Sin enlace"
            }
            onClick={() => setPanel("script")}
          />
        </CapsuleGroup>

        <CapsuleGroup label="Expediente">
          <ActionCapsule
            icon={Briefcase}
            title="Servicios"
            subtitle="Expedientes"
            onClick={() => setPanel("services")}
          />
          <ActionCapsule
            icon={CheckSquare}
            title="Tareas"
            subtitle="Pendientes"
            onClick={() => setPanel("tasks")}
          />
          <ActionCapsule
            icon={FileText}
            title="Documentos"
            subtitle={
              props.documentsCount > 0
                ? `${props.documentsCount} archivo${props.documentsCount === 1 ? "" : "s"}`
                : "Archivos"
            }
            onClick={() => setPanel("documents")}
          />
          <ActionCapsule
            icon={CreditCard}
            title="Pagos"
            subtitle="Cobros"
            onClick={() => setPanel("payments")}
          />
          <ActionCapsule
            icon={StickyNote}
            title="Notas"
            subtitle="Internas"
            onClick={() => setPanel("notes")}
          />
          {props.opsPanels.testimonials ? (
            <ActionCapsule
              icon={MessageSquareQuote}
              title="Testimonios"
              subtitle="Éxito"
              onClick={() => setPanel("testimonials")}
            />
          ) : null}
        </CapsuleGroup>

        <details className="group rounded-surface bg-surface-panel">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              ¿Qué le digo al cliente?
            </h3>
            <span className="text-[13px] font-medium text-action-primary group-open:hidden">
              Ver guion
            </span>
            <span className="hidden text-[13px] font-medium text-action-primary group-open:inline">
              Ocultar
            </span>
          </summary>
          <div className="border-t border-border-subtle px-4 pb-4 pt-3">
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={copyScript}
              >
                <Copy className="size-3.5" aria-hidden />
                Copiar guion
              </Button>
            </div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary">
              {props.salesScript}
            </p>
          </div>
        </details>
      </section>

      <section id="actividad" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
            Actividad
          </h2>
          {props.activityEvents.length > 5 ? (
            <button
              type="button"
              className="text-[13px] font-medium text-action-primary"
              onClick={() => setPanel("activity")}
            >
              Ver toda
            </button>
          ) : null}
        </div>
        {activityPreview.length === 0 ? (
          <p className="rounded-surface bg-surface-panel px-4 py-6 text-center text-[13px] text-text-secondary">
            Aún no hay actividad registrada.
          </p>
        ) : (
          <ActivityTimeline
            clientId={props.client.id}
            clientName={props.fullName}
            events={activityPreview}
          />
        )}
      </section>

      <AgencyModal
        open={panel === "edit"}
        onClose={() => setPanel(null)}
        title="Editar cliente"
      >
        <form action={onEdit} className="space-y-3">
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Nombre</span>
            <input
              name="firstName"
              defaultValue={props.client.firstName}
              required
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Apellido</span>
            <input
              name="lastName"
              defaultValue={props.client.lastName ?? ""}
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Correo</span>
            <input
              name="email"
              type="email"
              defaultValue={props.client.email ?? ""}
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          {error ? (
            <p className="text-[13px] text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            Guardar cambios
          </Button>
        </form>
      </AgencyModal>

      <AgencyModal
        open={panel === "delete"}
        onClose={() => setPanel(null)}
        title="Eliminar cliente"
      >
        <p className="mb-4 text-[13px] text-text-secondary">
          Esta acción archiva al cliente (no borra datos). Desaparecerá de la
          lista principal.
        </p>
        {error ? (
          <p className="mb-3 text-[13px] text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => setPanel(null)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1"
            disabled={pending}
            onClick={onArchive}
          >
            Archivar
          </Button>
        </div>
      </AgencyModal>

      <AgencyModal
        open={panel === "merge"}
        onClose={() => setPanel(null)}
        title="Unir expedientes"
      >
        <p className="text-[13px] text-text-secondary">
          Unir expedientes aún no está implementado en jh-crm. Esta UI queda
          lista; el merge server llega en un paso posterior.
        </p>
      </AgencyModal>

      <AgencyModal
        open={panel === "script"}
        onClose={() => setPanel(null)}
        title="Formulario de iniciación"
      >
        {props.intakeUrl ? (
          <div className="space-y-3">
            <p className="break-all rounded-control bg-surface-app px-3 py-2 font-mono text-[12px]">
              {props.intakeUrl}
            </p>
            <Button type="button" variant="primary" className="w-full" onClick={copyIntake}>
              Copiar enlace
            </Button>
            {props.intakeEnabled && props.canIntake ? (
              <div className="border-t border-border-subtle pt-3">
                <p className="mb-2 text-[12px] text-text-secondary">
                  O genera un enlace nuevo:
                </p>
                <CreateIntakeLinkCard
                  clientId={props.client.id}
                  cases={props.intakeCases}
                  existingLinks={props.intakeLinks}
                  compact
                />
              </div>
            ) : null}
          </div>
        ) : props.intakeEnabled && props.canIntake ? (
          <CreateIntakeLinkCard
            clientId={props.client.id}
            cases={props.intakeCases}
            existingLinks={props.intakeLinks}
          />
        ) : (
          <p className="text-[13px] text-text-secondary">
            No hay enlace de intake activo. Activa FEATURE_PUBLIC_INTAKE o
            genera uno con Añadir → Solicitar información.
          </p>
        )}
      </AgencyModal>

      {panel === "plan" ? (
        <InlinePanel title="Análisis de Crédito y Plan de Acción" onClose={() => setPanel(null)}>
          <div className="mx-auto max-w-2xl space-y-4">
            <p className="text-center text-[13px] text-text-secondary">
              Analizando a: <strong className="text-ink">{props.fullName}</strong>
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Capsule tone="danger">No calificado</Capsule>
              <Capsule tone="warning">Estimado fondeo —</Capsule>
              <Capsule tone="accent">{props.reportsCount} reportes</Capsule>
            </div>
            <div className="rounded-surface bg-surface-panel p-4">
              <h3 className="font-semibold text-ink">1 · Desglose por buró</h3>
              <p className="mt-2 text-[13px] text-text-secondary">
                {props.reportsCount > 0
                  ? "Usa el reporte de crédito del caso para scores y utilización. Umbrales guía: score 720 · utilización 10%."
                  : "Aún no hay reporte parseado. Sube un reporte de crédito para llenar este plan."}
              </p>
              {props.reportHref ? (
                <Link
                  href={props.reportHref}
                  className="mt-3 inline-block text-[13px] font-medium text-action-primary"
                >
                  Ver reporte →
                </Link>
              ) : null}
            </div>
            <div className="rounded-surface bg-surface-panel p-4">
              <h3 className="font-semibold text-ink">2 · Estructura</h3>
              <p className="mt-2 text-[13px] text-text-secondary">
                Orden sugerido: bajar utilización → disputar negativos →
                estabilizar 30 días → evaluar fondeo.
              </p>
            </div>
          </div>
        </InlinePanel>
      ) : null}

      {panel === "analisis" ? (
        <InlinePanel title="Cuentas negativas" onClose={() => setPanel(null)}>
          <div className="mx-auto max-w-xl space-y-3">
            <p className="text-[13px] text-text-secondary">
              Negativos: <strong>{props.kpis.porArreglar}</strong>
            </p>
            {props.kpis.porArreglar === 0 ? (
              <p className="rounded-surface bg-surface-panel px-4 py-6 text-center text-[13px] text-text-secondary">
                No hay cuentas negativas cargadas (o no hay reporte parseado).
              </p>
            ) : (
              <p className="rounded-surface bg-surface-panel px-4 py-4 text-[13px] text-text-secondary">
                Hay {props.kpis.porArreglar} ítems negativos en el caso. Abre el
                crédito para ver acreedor, buró y disputa.
                {props.caseId ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="font-medium text-action-primary"
                      onClick={() => setPanel("credit")}
                    >
                      Ir a crédito y rondas →
                    </button>
                  </>
                ) : null}
              </p>
            )}
          </div>
        </InlinePanel>
      ) : null}

      {panel === "score" ? (
        <InlinePanel title="Score Plan" onClose={() => setPanel(null)}>
          <div className="mx-auto max-w-lg space-y-4">
            <label className="block text-[13px]">
              <span className="mb-1 block font-medium">
                Utilización simulada: {utilPct}%
              </span>
              <input
                type="range"
                min={5}
                max={95}
                value={utilPct}
                onChange={(e) => setUtilPct(Number(e.target.value))}
                className="w-full"
              />
              <span className="text-text-secondary">Targets: 30% / 10%</span>
            </label>
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-ink">
                1 · Paga en este orden
              </p>
              {scoreOrder.map((row) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between rounded-control bg-surface-panel px-3 py-2 text-[13px]"
                >
                  <span>
                    {row.name} · {row.pct}%
                  </span>
                  <span className="font-mono tabular-nums">
                    ${row.amount.toLocaleString("en-US")}
                  </span>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() =>
                navigator.clipboard.writeText(
                  scoreOrder
                    .map(
                      (r) =>
                        `${r.name}: ${r.pct}% · $${r.amount.toLocaleString("en-US")}`,
                    )
                    .join("\n"),
                )
              }
            >
              Copiar plan para el cliente
            </Button>
          </div>
        </InlinePanel>
      ) : null}

      {panel === "fondeo" ? (
        <InlinePanel title="Calculadora de Fondeo" onClose={() => setPanel(null)}>
          <div className="mx-auto max-w-lg space-y-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">
              Datos del negocio
            </p>
            {(
              [
                ["business", "Nombre del negocio"],
                ["months", "Meses operando"],
                ["naics", "NAICS"],
                ["cash", "Cash en banco (USD)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-[13px]">
                <span className="mb-1 block font-medium">{label}</span>
                <input
                  value={fondeoForm[key]}
                  onChange={(e) =>
                    setFondeoForm((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full rounded-control bg-surface-panel px-3 py-2.5"
                />
              </label>
            ))}
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => {
                const cash = Number(fondeoForm.cash) || 0;
                const months = Number(fondeoForm.months) || 0;
                const estimate = Math.round(cash * 2.5 + months * 1500);
                setFondeoResult(
                  `Estimado heurístico (no API Fondify): $${estimate.toLocaleString("en-US")}`,
                );
              }}
            >
              Calcular fondeo
            </Button>
            {fondeoResult ? (
              <p className="rounded-control bg-surface-panel px-3 py-3 text-[14px] font-semibold text-ink">
                {fondeoResult}
              </p>
            ) : null}
          </div>
        </InlinePanel>
      ) : null}

      {panel === "services" ? (
        <InlinePanel title="Servicios" onClose={() => setPanel(null)}>
          {props.opsPanels.services}
        </InlinePanel>
      ) : null}
      {panel === "tasks" ? (
        <InlinePanel title="Tareas" onClose={() => setPanel(null)}>
          {props.opsPanels.tasks}
        </InlinePanel>
      ) : null}
      {panel === "documents" ? (
        <InlinePanel title="Documentos" onClose={() => setPanel(null)}>
          {props.opsPanels.documents}
        </InlinePanel>
      ) : null}
      {panel === "payments" ? (
        <InlinePanel title="Pagos" onClose={() => setPanel(null)}>
          {props.opsPanels.payments}
        </InlinePanel>
      ) : null}
      {panel === "notes" ? (
        <InlinePanel title="Notas" onClose={() => setPanel(null)}>
          {props.opsPanels.notes}
        </InlinePanel>
      ) : null}
      {panel === "testimonials" && props.opsPanels.testimonials ? (
        <InlinePanel title="Testimonios" onClose={() => setPanel(null)}>
          {props.opsPanels.testimonials}
        </InlinePanel>
      ) : null}
      {panel === "credit" ? (
        <InlinePanel title="Crédito y rondas" onClose={() => setPanel(null)}>
          {props.opsPanels.credit}
        </InlinePanel>
      ) : null}
      {panel === "activity" ? (
        <InlinePanel title="Actividad" onClose={() => setPanel(null)}>
          <ActivityTimeline
            clientId={props.client.id}
            clientName={props.fullName}
            events={props.activityEvents}
          />
        </InlinePanel>
      ) : null}
    </div>
  );
}
