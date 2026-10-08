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
  Pencil,
  Trash2,
  Merge,
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
  FileBarChart,
  MoreHorizontal,
  History,
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
import { ClientServicesPanel } from "@/src/components/clients/client-services-panel";
import { ClientTasksPanel } from "@/src/components/clients/client-tasks-panel";
import { ClientDocumentsPanel } from "@/src/components/clients/client-documents-panel";
import { ClientPaymentsPanel } from "@/src/components/clients/client-payments-panel";
import { ClientNotesPanel } from "@/src/components/clients/client-notes-panel";
import { ClientTestimonialsPanel } from "@/src/components/clients/client-testimonials-panel";
import { AnalyzePdfImportButton } from "@/src/components/credit-reports/analyze-pdf-import";
import { ClientNegativeAnalysisPanel } from "@/src/components/clients/client-negative-analysis-panel";
import { ClientAvancePanel } from "@/src/components/clients/client-avance-panel";
import { ClientQuoteHubPanel } from "@/src/components/clients/client-quote-hub-panel";
import { ClientContractHubPanel } from "@/src/components/clients/client-contract-hub-panel";
import {
  loadClientActionPlanHub,
  type ClientActionPlanHubDto,
} from "@/src/actions/credit-reports";
import {
  CreditReportEmptyPanel,
  CreditReportListModal,
  useCreditReportEntry,
  type CreditReportPdfDto,
} from "@/src/components/clients/client-credit-report-entry";
import { formatDate } from "@/src/lib/format";
import {
  loadClientOpsPanelAction,
  type ClientOpsPanel,
  type ClientOpsPanelPayload,
} from "@/src/actions/client-ops-panel";
import type {
  BureauProgress,
  ClientOverviewRound,
  ScoreHistoryPointDto,
} from "@/src/server/clients/overview";

export type AgencyClientDetailProps = {
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    status: ClientStatus;
  };
  fullName: string;
  reportsCount: number;
  roundNumber: number | null;
  nextReviewAt: Date | null;
  caseId: string | null;
  caseState: string | null;
  documentsCount: number;
  kpis: {
    porArreglar: number;
    fondeoPotencial: string;
    asesoriaHoy: string;
  };
  quoteHref: string;
  contractHref: string;
  reportHref: string;
  /** Deep-link: abrir Avance al montar (`?panel=avance`). */
  openAvance?: boolean;
  /** Deep-link: ronda inicial en Gestión (`?roundId=`). */
  initialAvanceRoundId?: string | null;
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
  canCreateRound: boolean;
  creditWorkspace: {
    canView: boolean;
    bureaus: BureauProgress[];
    scoreHistory: ScoreHistoryPointDto[];
    hasChartData: boolean;
    rounds: ClientOverviewRound[];
  } | null;
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
  /** Hay más actividad en servidor que el preview SSR. */
  activityHasMore?: boolean;
  /** Meta ligera para paneles lazy (sin datos de lista). */
  opsMeta: {
    showTestimonials: boolean;
    storageReady: boolean;
    negativeCount: number;
  };
  /** PDFs de crédito (Action Center → Reporte de crédito). */
  pdfReports: CreditReportPdfDto[];
  organizationName: string;
  /** Estados cápsulas Cierre (Fondify-like). */
  cierre: {
    quote: { label: string; id: string | null; href: string };
    contract: {
      label: string;
      id: string | null;
      status: string | null;
      href: string;
    };
    intake: { label: string };
  };
  quoteHub: {
    services: { id: string; name: string; defaultPrice: number }[];
    packages: { id: string; name: string; defaultPrice: number }[];
    defaultTaxRate: string;
    defaultTerms: string;
  } | null;
  contractHub: {
    canManage: boolean;
    templates: { id: string; name: string; version: string }[];
  };
};

type Panel =
  | null
  | "edit"
  | "delete"
  | "merge"
  | "analisis"
  | "score"
  | "fondeo"
  | "script"
  | "quote"
  | "contract"
  | "avance"
  | "services"
  | "tasks"
  | "documents"
  | "payments"
  | "notes"
  | "testimonials"
  | "activity"
  | "more"
  | "reportEmpty"
  | "reportList";

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

const LAZY_PANELS = new Set<Panel>([
  "services",
  "tasks",
  "documents",
  "payments",
  "notes",
  "testimonials",
  "activity",
]);

function OpsPanelSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-4 w-1/3 rounded bg-nav-hover" />
      <div className="h-24 rounded-xl bg-nav-hover/70" />
      <div className="h-24 rounded-xl bg-nav-hover/50" />
    </div>
  );
}

export function AgencyClientDetail(props: AgencyClientDetailProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(
    props.openAvance ? "avance" : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [utilPct, setUtilPct] = useState(10);
  const [planHub, setPlanHub] = useState<ClientActionPlanHubDto | null>(null);
  const [planHubLoading, setPlanHubLoading] = useState(false);
  const [planHubError, setPlanHubError] = useState<string | null>(null);
  const [fondeoForm, setFondeoForm] = useState({
    business: "",
    months: "12",
    naics: "",
    cash: "",
  });
  const [fondeoResult, setFondeoResult] = useState<string | null>(null);
  const [opsCache, setOpsCache] = useState<
    Partial<Record<ClientOpsPanel, ClientOpsPanelPayload>>
  >({});
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsError, setOpsError] = useState<string | null>(null);
  const opsLoadedRef = useRef(new Set<ClientOpsPanel>());
  const [activeReportId, setActiveReportId] = useState<string | null>(
    props.pdfReports[0]?.id ?? null,
  );
  const { enterCreditReport, openReport } = useCreditReportEntry({
    clientId: props.client.id,
    pdfReports: props.pdfReports,
  });

  const bucket = mapClientToFondifyStatus(props.client.status);
  const days = props.nextReviewAt ? daysUntil(props.nextReviewAt) : null;
  const soon = days != null && isReviewSoon(days);

  useEffect(() => {
    if (
      activeReportId &&
      props.pdfReports.some((r) => r.id === activeReportId)
    ) {
      return;
    }
    setActiveReportId(props.pdfReports[0]?.id ?? null);
  }, [props.pdfReports, activeReportId]);

  function onCreditReportCapsule() {
    const result = enterCreditReport();
    if (result === "empty") setPanel("reportEmpty");
    if (result === "list") setPanel("reportList");
  }

  useEffect(() => {
    if (!panel || !LAZY_PANELS.has(panel)) return;
    if (panel === "testimonials" && !props.opsMeta.showTestimonials) return;
    const key = panel as ClientOpsPanel;
    if (opsLoadedRef.current.has(key)) return;
    opsLoadedRef.current.add(key);

    let cancelled = false;
    setOpsLoading(true);
    setOpsError(null);
    void loadClientOpsPanelAction(props.client.id, key).then((result) => {
      if (cancelled) return;
      setOpsLoading(false);
      if (!result.ok) {
        opsLoadedRef.current.delete(key);
        setOpsError(result.error || "No se pudo cargar el panel.");
        return;
      }
      setOpsCache((prev) => ({ ...prev, [key]: result.data }));
    });
    return () => {
      cancelled = true;
    };
  }, [panel, props.client.id, props.opsMeta.showTestimonials]);
  const showRepairBanner = bucket === "repair" && props.kpis.porArreglar > 0;

  useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [moreOpen]);

  useEffect(() => {
    if (panel !== "score" && panel !== "fondeo") return;
    let cancelled = false;
    setPlanHubLoading(true);
    setPlanHubError(null);
    void loadClientActionPlanHub({
      clientId: props.client.id,
      reportId: activeReportId,
    }).then((res) => {
      if (cancelled) return;
      setPlanHubLoading(false);
      if (!res.ok) {
        setPlanHub(null);
        setPlanHubError(res.error);
        return;
      }
      setPlanHub(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [panel, props.client.id, activeReportId]);

  const scoreOrder = useMemo(() => {
    const cards = planHub?.revolving.cards ?? [];
    const withLimit = cards
      .filter((c) => c.limit != null && c.limit > 0)
      .map((c) => {
        const limit = c.limit!;
        const balance = c.balance ?? 0;
        const currentPct =
          c.utilization ?? (limit > 0 ? (balance / limit) * 100 : 0);
        const targetBalance = limit * (utilPct / 100);
        const amount = Math.max(0, Math.round(balance - targetBalance));
        return {
          name: c.creditorName,
          pct: Math.round(currentPct),
          amount,
        };
      })
      .sort((a, b) => b.pct - a.pct);
    if (withLimit.length > 0) return withLimit;
    const base = Math.max(100, Math.round(5000 * (utilPct / 100)));
    return [
      { name: "Sin tarjetas en reporte", pct: utilPct, amount: base },
    ];
  }, [planHub, utilPct]);

  function onEdit(formData: FormData) {
    setError(null);
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const source = String(formData.get("source") ?? "").trim();
    const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
    const addressLine2 = String(formData.get("addressLine2") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const state = String(formData.get("state") ?? "").trim();
    const postalCode = String(formData.get("postalCode") ?? "").trim();
    startTransition(async () => {
      const result = await updateClient(props.client.id, {
        firstName,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        source: source || undefined,
        addressLine1: addressLine1 || undefined,
        addressLine2: addressLine2 || undefined,
        city: city || undefined,
        state: state || undefined,
        postalCode: postalCode || undefined,
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
              {` · ${props.pdfReports.length} reporte${props.pdfReports.length === 1 ? "" : "s"}`}
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
              <button
                type="button"
                className="font-medium text-action-primary"
                onClick={() => setPanel("avance")}
              >
                Abrir centro de rondas →
              </button>
            </div>
            {props.pdfReports.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  Historial
                </span>
                {props.pdfReports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveReportId(r.id)}
                    className={`rounded-full px-3 py-1 font-mono text-[12px] tabular-nums transition-colors ${
                      activeReportId === r.id
                        ? "bg-action-primary text-action-primary-foreground"
                        : "bg-surface-app text-text-secondary ring-1 ring-border-subtle hover:text-action-primary"
                    }`}
                  >
                    {formatDate(r.reportDate)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPanel("documents")}
            >
              Documentos
              {props.documentsCount > 0 ? ` ${props.documentsCount}` : ""}
            </Button>
            {props.quickAdd.canReport && props.caseId ? (
              <AnalyzePdfImportButton
                caseId={props.caseId}
                label="Subir reporte"
              />
            ) : null}
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
              caseState={props.caseState}
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
            icon={FileBarChart}
            title="Reporte de crédito"
            subtitle="El documento completo"
            onClick={onCreditReportCapsule}
          />
          <ActionCapsule
            icon={ListChecks}
            title="Plan de Acción"
            subtitle="Lectura + pasos a dar"
            badge="Nuevo"
            href={`/crm/clientes/${props.client.id}/plan-de-accion${
              activeReportId ? `?reportId=${activeReportId}` : ""
            }`}
          />
          <ActionCapsule
            icon={Search}
            title="Análisis"
            subtitle={
              props.kpis.porArreglar > 0
                ? `${props.kpis.porArreglar} negativos`
                : "Negativos"
            }
            badge="Beta"
            onClick={() => setPanel("analisis")}
          />
          <ActionCapsule
            icon={TrendingUp}
            title="Score Plan"
            subtitle="Sube el puntaje"
            badge="Beta"
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
            title="Avance"
            subtitle={
              props.roundNumber != null
                ? `Ronda ${props.roundNumber}`
                : "Progreso por rondas"
            }
            badge="Beta"
            onClick={() => setPanel("avance")}
          />
        </CapsuleGroup>

        <CapsuleGroup label="Cierre">
          <ActionCapsule
            icon={Receipt}
            title="Cotización"
            subtitle={props.cierre.quote.label}
            onClick={() => setPanel("quote")}
          />
          <ActionCapsule
            icon={Scale}
            title="Contrato"
            subtitle={props.cierre.contract.label}
            onClick={() => setPanel("contract")}
          />
          <ActionCapsule
            icon={ClipboardList}
            title="Formulario"
            subtitle={props.cierre.intake.label}
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
            icon={FileBarChart}
            title="Evolución"
            subtitle={
              props.reportsCount > 0
                ? `${props.reportsCount} score${props.reportsCount === 1 ? "" : "s"}`
                : "Scores"
            }
            href={props.reportHref}
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
          <ActionCapsule
            icon={History}
            title="Actividad"
            subtitle={
              props.activityEvents.length > 0
                ? props.activityHasMore
                  ? `${props.activityEvents.length}+ eventos`
                  : `${props.activityEvents.length} evento${props.activityEvents.length === 1 ? "" : "s"}`
                : "Timeline"
            }
            onClick={() => setPanel("activity")}
          />
          {props.opsMeta.showTestimonials ? (
            <ActionCapsule
              icon={MessageSquareQuote}
              title="Testimonios"
              subtitle="Éxito"
              onClick={() => setPanel("testimonials")}
            />
          ) : null}
        </CapsuleGroup>
      </section>

      <AgencyModal
        open={panel === "edit"}
        onClose={() => setPanel(null)}
        title="Editar cliente"
        size="lg"
      >
        <form action={onEdit} className="grid gap-3 sm:grid-cols-2">
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
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Teléfono</span>
            <input
              name="phone"
              type="tel"
              defaultValue={props.client.phone ?? ""}
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-[13px] sm:col-span-2">
            <span className="mb-1 block font-medium">Fuente</span>
            <input
              name="source"
              defaultValue={props.client.source ?? ""}
              placeholder="Referido, web, Facebook…"
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-[13px] sm:col-span-2">
            <span className="mb-1 block font-medium">Dirección</span>
            <input
              name="addressLine1"
              defaultValue={props.client.addressLine1 ?? ""}
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-[13px] sm:col-span-2">
            <span className="mb-1 block font-medium">Dirección (línea 2)</span>
            <input
              name="addressLine2"
              defaultValue={props.client.addressLine2 ?? ""}
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Ciudad</span>
            <input
              name="city"
              defaultValue={props.client.city ?? ""}
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px]">
              <span className="mb-1 block font-medium">Estado</span>
              <input
                name="state"
                defaultValue={props.client.state ?? ""}
                maxLength={2}
                className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm uppercase"
              />
            </label>
            <label className="block text-[13px]">
              <span className="mb-1 block font-medium">C.P.</span>
              <input
                name="postalCode"
                defaultValue={props.client.postalCode ?? ""}
                className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
              />
            </label>
          </div>
          {error ? (
            <p className="text-[13px] text-danger sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="w-full sm:col-span-2"
            disabled={pending}
          >
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
        open={panel === "quote"}
        onClose={() => setPanel(null)}
        title="Cotización"
        size="xl"
      >
        {panel === "quote" && props.quoteHub ? (
          <ClientQuoteHubPanel
            clientId={props.client.id}
            clientLabel={props.fullName}
            caseId={props.caseId}
            reportId={activeReportId}
            existingQuoteId={props.cierre.quote.id}
            quoteStatusLabel={props.cierre.quote.label}
            services={props.quoteHub.services}
            packages={props.quoteHub.packages}
            defaultTaxRate={props.quoteHub.defaultTaxRate}
            defaultTerms={props.quoteHub.defaultTerms}
          />
        ) : panel === "quote" ? (
          <div className="space-y-3 text-center">
            <p className="text-[13px] text-text-secondary">
              Estado:{" "}
              <strong className="text-ink">{props.cierre.quote.label}</strong>
            </p>
            <Link
              href={props.cierre.quote.href}
              className="inline-flex rounded-control bg-action-primary px-4 py-2 text-sm font-medium text-action-primary-foreground"
            >
              {props.cierre.quote.id ? "Abrir cotización" : "Nueva cotización"}
            </Link>
          </div>
        ) : null}
      </AgencyModal>

      <AgencyModal
        open={panel === "contract"}
        onClose={() => setPanel(null)}
        title="Contrato"
        size="lg"
      >
        {panel === "contract" ? (
          <ClientContractHubPanel
            clientId={props.client.id}
            contractId={props.cierre.contract.id}
            contractStatus={props.cierre.contract.status}
            statusLabel={props.cierre.contract.label}
            templates={props.contractHub.templates}
            canManage={props.contractHub.canManage}
          />
        ) : null}
      </AgencyModal>

      <AgencyModal
        open={panel === "script"}
        onClose={() => setPanel(null)}
        title="Formulario de iniciación"
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-center text-[13px] text-text-secondary">
            Estado:{" "}
            <strong className="text-ink">{props.cierre.intake.label}</strong>
          </p>
          {props.intakeUrl ? (
            <>
              <p className="break-all rounded-control bg-surface-app px-3 py-2 font-mono text-[12px]">
                {props.intakeUrl}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  className="flex-1"
                  onClick={copyIntake}
                >
                  Copiar enlace
                </Button>
                <a
                  href={`mailto:${props.client.email ?? ""}?subject=${encodeURIComponent(
                    "Formulario de iniciación",
                  )}&body=${encodeURIComponent(
                    `Hola ${props.fullName},\n\nCompleta tu formulario aquí:\n${props.intakeUrl}\n`,
                  )}`}
                  className="inline-flex flex-1 items-center justify-center rounded-control bg-surface-panel px-3 py-2 text-sm font-medium text-ink ring-1 ring-border-subtle"
                >
                  Enviar por email
                </a>
              </div>
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
            </>
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
        </div>
      </AgencyModal>

      <AgencyModal
        open={panel === "analisis"}
        onClose={() => setPanel(null)}
        title="Análisis · cuentas negativas"
        size="lg"
      >
        {panel === "analisis" ? (
          <ClientNegativeAnalysisPanel
            clientId={props.client.id}
            reportId={activeReportId}
          />
        ) : null}
      </AgencyModal>

      <AgencyModal
        open={panel === "avance"}
        onClose={() => setPanel(null)}
        title="Avance"
        size="xl"
      >
        {panel === "avance" ? (
          <ClientAvancePanel
            clientId={props.client.id}
            reportId={activeReportId}
            caseId={props.caseId}
            canCreateRound={props.canCreateRound}
            initialRoundId={props.initialAvanceRoundId ?? null}
            initialTab={
              props.initialAvanceRoundId || props.openAvance
                ? "gestion"
                : undefined
            }
          />
        ) : null}
      </AgencyModal>

      <AgencyModal
        open={panel === "score"}
        onClose={() => setPanel(null)}
        title="Score Plan"
        size="lg"
        centerBody
      >
        <div className="space-y-4">
          {planHubLoading ? (
            <p className="text-center text-[13px] text-text-secondary">
              Cargando revolving del reporte…
            </p>
          ) : null}
          {planHubError ? (
            <p className="text-center text-sm text-danger">{planHubError}</p>
          ) : null}
          {planHub ? (
            <p className="text-center text-[12px] text-text-secondary">
              Util. actual:{" "}
              {planHub.revolving.utilPct != null
                ? `${planHub.revolving.utilPct.toFixed(1)}%`
                : "—"}{" "}
              · {planHub.revolving.openCards} tarjetas
              {planHub.avgScore != null ? ` · score ${planHub.avgScore}` : ""}
            </p>
          ) : null}
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">
              Utilización objetivo: {utilPct}%
            </span>
            <input
              type="range"
              min={5}
              max={95}
              value={utilPct}
              onChange={(e) => setUtilPct(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-text-secondary">
              Meta típica 30% / 10% — monto = pagar para llegar a la meta
            </span>
          </label>
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-ink">
              1 · Paga en este orden
            </p>
            {scoreOrder.map((row) => (
              <div
                key={`${row.name}-${row.pct}`}
                className="flex items-center justify-between rounded-control bg-nav-hover/50 px-3 py-2 text-[13px]"
              >
                <span>
                  {row.name} · ahora {row.pct}%
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
                      `${r.name}: ahora ${r.pct}% → pagar $${r.amount.toLocaleString("en-US")} (meta ${utilPct}%)`,
                  )
                  .join("\n"),
              )
            }
          >
            Copiar plan para el cliente
          </Button>
        </div>
      </AgencyModal>

      <AgencyModal
        open={panel === "fondeo"}
        onClose={() => setPanel(null)}
        title="Calculadora de Fondeo"
        size="lg"
        centerBody
      >
        <div className="space-y-3">
          {planHubLoading ? (
            <p className="text-center text-[13px] text-text-secondary">
              Cargando perfil crediticio…
            </p>
          ) : null}
          {planHubError ? (
            <p className="text-center text-sm text-danger">{planHubError}</p>
          ) : null}
          {planHub ? (
            <div className="rounded-surface bg-nav-hover/40 px-3 py-3 text-center text-[13px]">
              <p
                className={`font-semibold ${
                  planHub.qualified ? "text-success-ink" : "text-danger-ink"
                }`}
              >
                {planHub.qualified
                  ? "Perfil con señales de elegibilidad"
                  : "No calificado actualmente"}
              </p>
              <p className="mt-1 text-text-secondary">
                {planHub.bureausApproved}/3 burós · score{" "}
                {planHub.avgScore ?? "—"} · util{" "}
                {planHub.avgUtilization != null
                  ? `${planHub.avgUtilization}%`
                  : "—"}
              </p>
              <p className="mt-2 text-[12px] text-text-secondary">
                {planHub.verdict}
              </p>
              <Link
                href={`/crm/clientes/${props.client.id}/plan-de-accion?reportId=${planHub.reportId}`}
                className="mt-2 inline-flex text-[12px] font-medium text-action-primary"
              >
                Ver plan de acción completo →
              </Link>
            </div>
          ) : null}
          <p className="text-center text-[12px] font-semibold uppercase tracking-wide text-text-secondary">
            Datos del negocio (estimado)
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
                className="w-full rounded-control bg-nav-hover px-3 py-2.5"
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
              const raw = Math.round(cash * 2.5 + months * 1500);
              const blocked = planHub != null && !planHub.qualified;
              const estimate = blocked ? 0 : raw;
              const note = blocked
                ? "Perfil no calificado — estimado $0 hasta mejorar burós. "
                : planHub?.qualified
                  ? "Perfil con señales de elegibilidad. "
                  : "";
              setFondeoResult(
                `${note}Estimado heurístico: $${estimate.toLocaleString("en-US")}`,
              );
            }}
          >
            Calcular fondeo
          </Button>
          {fondeoResult ? (
            <p className="rounded-control bg-nav-hover/50 px-3 py-3 text-center text-[14px] font-semibold text-ink">
              {fondeoResult}
            </p>
          ) : null}
        </div>
      </AgencyModal>

      <AgencyModal
        open={panel === "services"}
        onClose={() => setPanel(null)}
        title="Servicios"
        size="xl"
      >
        {opsLoading && !opsCache.services ? (
          <OpsPanelSkeleton />
        ) : opsError && !opsCache.services ? (
          <p className="text-sm text-danger">{opsError}</p>
        ) : opsCache.services?.panel === "services" ? (
          <ClientServicesPanel
            clientId={props.client.id}
            clientArchived={opsCache.services.clientArchived}
            serviceCases={opsCache.services.serviceCases}
            orphanCases={opsCache.services.orphanCases}
            canManage={opsCache.services.canManage}
            services={opsCache.services.services}
            members={opsCache.services.members}
          />
        ) : null}
      </AgencyModal>
      <AgencyModal
        open={panel === "tasks"}
        onClose={() => setPanel(null)}
        title="Tareas"
        size="xl"
      >
        {opsLoading && !opsCache.tasks ? (
          <OpsPanelSkeleton />
        ) : opsError && !opsCache.tasks ? (
          <p className="text-sm text-danger">{opsError}</p>
        ) : opsCache.tasks?.panel === "tasks" ? (
          <ClientTasksPanel
            clientId={props.client.id}
            tasks={opsCache.tasks.tasks}
            members={opsCache.tasks.members}
            canManage={opsCache.tasks.canManage}
            timezone={opsCache.tasks.timezone}
            cases={opsCache.tasks.cases}
          />
        ) : null}
      </AgencyModal>
      <AgencyModal
        open={panel === "documents"}
        onClose={() => setPanel(null)}
        title="Documentos"
        size="xl"
      >
        {opsLoading && !opsCache.documents ? (
          <OpsPanelSkeleton />
        ) : opsError && !opsCache.documents ? (
          <p className="text-sm text-danger">{opsError}</p>
        ) : opsCache.documents?.panel === "documents" ? (
          <ClientDocumentsPanel
            clientId={props.client.id}
            documents={opsCache.documents.documents}
            canUpload={opsCache.documents.canUpload}
            storageReady={props.opsMeta.storageReady}
          />
        ) : null}
      </AgencyModal>
      <AgencyModal
        open={panel === "payments"}
        onClose={() => setPanel(null)}
        title="Pagos"
        size="xl"
      >
        {opsLoading && !opsCache.payments ? (
          <OpsPanelSkeleton />
        ) : opsError && !opsCache.payments ? (
          <p className="text-sm text-danger">{opsError}</p>
        ) : opsCache.payments?.panel === "payments" ? (
          <ClientPaymentsPanel
            clientId={props.client.id}
            payments={opsCache.payments.payments}
            canRegister={opsCache.payments.canRegister}
            cases={opsCache.payments.cases}
          />
        ) : null}
      </AgencyModal>
      <AgencyModal
        open={panel === "notes"}
        onClose={() => setPanel(null)}
        title="Notas"
        size="xl"
      >
        {opsLoading && !opsCache.notes ? (
          <OpsPanelSkeleton />
        ) : opsError && !opsCache.notes ? (
          <p className="text-sm text-danger">{opsError}</p>
        ) : opsCache.notes?.panel === "notes" ? (
          <ClientNotesPanel
            clientId={props.client.id}
            notes={opsCache.notes.notes}
            canEdit={opsCache.notes.canEdit}
          />
        ) : null}
      </AgencyModal>
      <AgencyModal
        open={panel === "testimonials" && props.opsMeta.showTestimonials}
        onClose={() => setPanel(null)}
        title="Testimonios"
        size="xl"
      >
        {opsLoading && !opsCache.testimonials ? (
          <OpsPanelSkeleton />
        ) : opsError && !opsCache.testimonials ? (
          <p className="text-sm text-danger">{opsError}</p>
        ) : opsCache.testimonials?.panel === "testimonials" ? (
          <ClientTestimonialsPanel
            clientId={props.client.id}
            defaultName={opsCache.testimonials.defaultName}
            rows={opsCache.testimonials.rows}
            cases={opsCache.testimonials.cases}
            manage={opsCache.testimonials.manage}
            publish={opsCache.testimonials.publish}
          />
        ) : null}
      </AgencyModal>
      <AgencyModal
        open={panel === "activity"}
        onClose={() => setPanel(null)}
        title="Actividad"
        size="lg"
      >
        {opsLoading && !opsCache.activity ? (
          <OpsPanelSkeleton />
        ) : opsError && !opsCache.activity ? (
          <p className="text-sm text-danger">{opsError}</p>
        ) : (
          <ActivityTimeline
            clientId={props.client.id}
            clientName={props.fullName}
            events={
              opsCache.activity?.panel === "activity"
                ? opsCache.activity.events
                : props.activityEvents
            }
            compact
          />
        )}
      </AgencyModal>

      <AgencyModal
        open={panel === "reportEmpty"}
        onClose={() => setPanel(null)}
        title="Reporte de crédito"
        size="md"
        centerBody
      >
        <CreditReportEmptyPanel
          caseId={props.caseId}
          canManage={props.quickAdd.canReport}
        />
      </AgencyModal>

      <CreditReportListModal
        open={panel === "reportList"}
        onClose={() => setPanel(null)}
        reports={props.pdfReports}
        onSelect={(reportId) => {
          setPanel(null);
          setActiveReportId(reportId);
          openReport(reportId);
        }}
      />
    </div>
  );
}
