"use client";

import {
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock3,
  Columns3,
  List,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Sparkles,
  UserRound,
  Waypoints,
} from "lucide-react";
import {
  Alert,
  Button,
  ButtonLink,
  Field,
  Modal,
  Pill,
  Select,
  Textarea,
} from "@/src/components/ui";
import {
  markOpportunityLostAction,
  markOpportunityWonAction,
  updateOpportunityStageAction,
} from "@/src/actions/opportunities";
import { addLeadMessageAction } from "@/src/actions/notes";
import { EditLeadButton } from "@/src/components/opportunities/edit-lead-button";
import { playActionResult } from "@/src/lib/cuelume";
import {
  formatLeadRegisteredAt,
  resolveLeadIntent,
  type LeadMessage,
} from "@/src/lib/leads-intent";
import { resolveWonServiceCode } from "@/src/lib/won-service";
import {
  labelFor,
  LEAD_CHANNEL_LABELS,
  OPPORTUNITY_STAGE_LABELS,
} from "@/src/lib/labels";
import {
  getStoredLeadsView,
  setStoredLeadsView,
  subscribeStoredLeadsView,
  PIPELINE_STAGES,
  stageTheme,
  type LeadsViewMode,
} from "@/src/lib/opportunity-stages";
import { formatDate, formatDateTime, formatMoney, isPast } from "@/src/lib/format";

export type OppCard = {
  id: string;
  stage: string;
  createdAt?: Date | string;
  estimatedValue: string | null;
  source: string | null;
  campaign: string | null;
  nextFollowUpAt: Date | string | null;
  client: {
    id: string;
    clientCode: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    leadChannel: string | null;
    serviceRequested: string | null;
    preferredContactMethod?: string | null;
    preferredContactTime?: string | null;
    attribution?: unknown;
    createdAt: Date | string;
    consultations?: Array<{
      id: string;
      notes: string | null;
      status: string;
      amount: string | null;
      requestedAt: Date | string;
    }>;
    activities?: Array<{
      id: string;
      type: string;
      description: string;
      createdAt: Date | string;
      metadata?: unknown;
    }>;
    notes?: Array<{
      id: string;
      body: string;
      createdAt: Date | string;
      author?: { id: string; name: string | null } | null;
    }>;
  };
  owner: { id: string; name: string | null } | null;
  wonCase: {
    id: string;
    caseCode: string;
    serviceCaseId?: string | null;
  } | null;
  wonServiceCase?: {
    id: string;
    caseNumber: string;
    status: string;
    serviceId: string;
    creditCase?: { id: string; caseCode: string } | null;
  } | null;
};

type MemberOption = { id: string; name: string };
type ServiceOption = { code: string; name: string };
type Columns = Record<string, OppCard[]>;

const MOVE_STAGES = PIPELINE_STAGES.filter((s) => s !== "WON" && s !== "LOST");
const DND_MIME = "application/x-jh-lead-id";

const DEFAULT_WON_SERVICES: ServiceOption[] = [
  { code: "CREDIT_REPAIR", name: "Credit Repair" },
  { code: "HOME_BUYER", name: "Compra de Casa" },
  { code: "BUSINESS_CREDIT", name: "Financiamiento de Negocio" },
  { code: "PERSONAL_LOAN", name: "Préstamo Personal" },
  { code: "WEB_DEVELOPMENT", name: "Desarrollo Web" },
  { code: "CRM_DEVELOPMENT", name: "Desarrollo CRM" },
];

function clientName(opp: OppCard) {
  return [opp.client.firstName, opp.client.lastName].filter(Boolean).join(" ");
}

function cloneColumns(source: Columns): Columns {
  const next: Columns = {};
  for (const stage of PIPELINE_STAGES) {
    next[stage] = [...(source[stage] ?? [])];
  }
  return next;
}

function LeadCardFace({
  opp,
  stage,
  dense = false,
}: {
  opp: OppCard;
  stage: string;
  dense?: boolean;
}) {
  const theme = stageTheme(stage);
  const registeredAt = opp.client.createdAt ?? opp.createdAt ?? null;
  const followUpAt = opp.nextFollowUpAt
    ? typeof opp.nextFollowUpAt === "string"
      ? new Date(opp.nextFollowUpAt)
      : opp.nextFollowUpAt
    : null;
  const followUpOverdue =
    followUpAt != null &&
    !Number.isNaN(followUpAt.getTime()) &&
    isPast(followUpAt) &&
    stage !== "WON" &&
    stage !== "LOST";

  return (
    <>
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full ring-1 ${theme.avatarWrap}`}
          aria-hidden
        >
          <UserRound
            className={`size-5 ${theme.avatarIcon}`}
            strokeWidth={1.75}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink">
            {clientName(opp)}
          </p>
          {registeredAt ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary">
              <Clock3
                className="size-3.5 shrink-0 opacity-70"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="truncate">
                {formatLeadRegisteredAt(registeredAt)}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={`mt-3.5 space-y-2 ${dense ? "" : "pl-[3.25rem]"}`}
      >
        {opp.client.email ? (
          <p className="flex items-center gap-2 text-[13px] text-text-secondary-strong">
            <Mail
              className="size-3.5 shrink-0 text-text-secondary"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="truncate">{opp.client.email}</span>
          </p>
        ) : null}
        {opp.client.phone ? (
          <p className="flex items-center gap-2 text-[13px] text-text-secondary-strong">
            <Phone
              className="size-3.5 shrink-0 text-text-secondary"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="truncate">{opp.client.phone}</span>
          </p>
        ) : null}
        {!opp.client.email && !opp.client.phone ? (
          <p className="text-[12px] text-text-secondary">
            Sin correo ni teléfono
          </p>
        ) : null}
        {followUpAt ? (
          <p
            className={`pt-0.5 text-[11px] tabular-nums ${
              followUpOverdue
                ? "font-medium text-danger-ink"
                : "text-text-secondary"
            }`}
          >
            {followUpOverdue ? "Vencido · " : "Seguimiento · "}
            {formatDate(followUpAt)}
          </p>
        ) : null}
      </div>
    </>
  );
}

export function OpportunityKanban({
  columns,
  canManage,
  canEditLead,
  members,
  services,
}: {
  columns: Columns;
  canManage: boolean;
  canEditLead: boolean;
  members: MemberOption[];
  services?: ServiceOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [wonFor, setWonFor] = useState<string | null>(null);
  const [wonServiceCode, setWonServiceCode] = useState("CREDIT_REPAIR");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<LeadMessage[]>([]);
  const view = useSyncExternalStore(
    subscribeStoredLeadsView,
    getStoredLeadsView,
    () => "kanban" as LeadsViewMode,
  );
  const [localColumns, applyOptimisticColumns] = useOptimistic(
    columns,
    (current, update: { oppId: string; toStage: string }) => {
      const next = cloneColumns(current);
      let moved: OppCard | null = null;
      for (const stage of PIPELINE_STAGES) {
        const idx = next[stage].findIndex((o) => o.id === update.oppId);
        if (idx >= 0) {
          moved = { ...next[stage][idx], stage: update.toStage };
          next[stage].splice(idx, 1);
          break;
        }
      }
      if (!moved) return current;
      next[update.toStage] = [moved, ...next[update.toStage]];
      return next;
    },
  );
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const didDragRef = useRef(false);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Record<string, HTMLElement | null>>({});

  function setViewMode(next: LeadsViewMode) {
    setStoredLeadsView(next);
  }

  const flat = useMemo(
    () => PIPELINE_STAGES.flatMap((s) => localColumns[s] ?? []),
    [localColumns],
  );
  const selected = flat.find((o) => o.id === selectedId) ?? null;
  const wonTarget = flat.find((o) => o.id === wonFor) ?? null;
  const wonServiceOptions =
    services && services.length > 0 ? services : DEFAULT_WON_SERVICES;
  const selectedIntent = selected
    ? resolveLeadIntent({
        source: selected.client.source ?? selected.source,
        campaign: selected.campaign,
        leadChannel: selected.client.leadChannel,
        serviceRequested: selected.client.serviceRequested,
        attribution: selected.client.attribution,
        consultations: selected.client.consultations,
        activities: selected.client.activities,
        notes: selected.client.notes,
      })
    : null;

  const historyMessages = useMemo(() => {
    const fromServer = selectedIntent?.messages ?? [];
    const ids = new Set(fromServer.map((m) => m.id));
    const extras = localMessages.filter((m) => !ids.has(m.id));
    return [...extras, ...fromServer];
  }, [selectedIntent?.messages, localMessages]);

  function openLead(id: string) {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setSelectedId(id);
    setMessageDraft("");
    setMessageError(null);
    setLocalMessages([]);
  }

  function submitLeadMessage() {
    if (!selected) return;
    const body = messageDraft.trim();
    if (!body) {
      setMessageError("Escribe un mensaje.");
      return;
    }
    setMessageError(null);
    startTransition(async () => {
      const result = await addLeadMessageAction({
        clientId: selected.client.id,
        opportunityId: selected.id,
        body,
      });
      if (!result.ok) {
        playActionResult(false);
        setMessageError(result.error ?? "No se pudo guardar.");
        return;
      }
      playActionResult(true);
      setLocalMessages((prev) => [
        {
          id: result.data.id,
          body: result.data.body,
          at: result.data.createdAt,
          kind: "note",
          authorName: result.data.authorName,
        },
        ...prev,
      ]);
      setMessageDraft("");
      router.refresh();
    });
  }

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of PIPELINE_STAGES) {
      counts[stage] = localColumns[stage]?.length ?? 0;
    }
    return counts;
  }, [localColumns]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        playActionResult(false);
        setError(result.error ?? "Error");
        return;
      }
      playActionResult(true);
      setLostFor(null);
      setLostReason("");
      setWonFor(null);
      router.refresh();
    });
  }

  function scrollToStage(stage: string) {
    const el = columnRefs.current[stage];
    el?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }

  function findOpp(id: string): OppCard | null {
    return flat.find((o) => o.id === id) ?? null;
  }

  function requestMove(oppId: string, toStage: string) {
    const opp = findOpp(oppId);
    if (!opp || opp.stage === toStage) return;
    if (opp.stage === "WON" || opp.stage === "LOST") return;

    if (toStage === "WON") {
      const oppForWon = findOpp(oppId);
      setWonServiceCode(
        resolveWonServiceCode(
          null,
          oppForWon?.client.serviceRequested,
        ),
      );
      setWonFor(oppId);
      return;
    }
    if (toStage === "LOST") {
      setLostReason("");
      setLostFor(oppId);
      return;
    }

    setError(null);
    startTransition(async () => {
      applyOptimisticColumns({ oppId, toStage });
      const result = await updateOpportunityStageAction(oppId, {
        stage: toStage,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error ?? "Error");
        return;
      }
      playActionResult(true);
      router.refresh();
    });
  }

  function onDragStart(e: DragEvent, opp: OppCard) {
    if (!canManage || opp.stage === "WON" || opp.stage === "LOST") {
      e.preventDefault();
      return;
    }
    didDragRef.current = false;
    setDraggingId(opp.id);
    e.dataTransfer.setData(DND_MIME, opp.id);
    e.dataTransfer.setData("text/plain", opp.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrag(e: DragEvent) {
    if (e.clientX !== 0 || e.clientY !== 0) didDragRef.current = true;
  }

  function onDragEnd() {
    setDraggingId(null);
    setDragOverStage(null);
  }

  function onDragOverColumn(e: DragEvent, stage: string) {
    if (!canManage) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  }

  function onDropColumn(e: DragEvent, stage: string) {
    e.preventDefault();
    const id =
      e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData("text/plain");
    setDragOverStage(null);
    setDraggingId(null);
    if (id) requestMove(id, stage);
  }

  const viewToggle = (
    <div
      className="inline-flex rounded-control border border-border-subtle bg-surface-panel/70 p-0.5"
      role="group"
      aria-label="Vista de leads"
    >
      {(
        [
          { id: "kanban", label: "Tablero", icon: Columns3 },
          { id: "list", label: "Lista", icon: List },
          { id: "timeline", label: "Línea", icon: Waypoints },
        ] as const
      ).map((opt) => {
        const Icon = opt.icon;
        const active = view === opt.id;
        return (
          <Button
            key={opt.id}
            type="button"
            size="sm"
            variant={active ? "secondary" : "ghost"}
            aria-pressed={active}
            className="min-h-9 gap-1.5 px-2.5"
            onClick={() => setViewMode(opt.id)}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{opt.label}</span>
          </Button>
        );
      })}
    </div>
  );

  const progressStrip = (
    <nav
      aria-label="Progreso del pipeline"
      className="overflow-x-auto pb-1"
    >
      <ol className="flex min-w-max items-stretch gap-0 px-0.5">
        {PIPELINE_STAGES.map((stage, index) => {
          const theme = stageTheme(stage);
          const count = stageCounts[stage] ?? 0;
          const short = labelFor(OPPORTUNITY_STAGE_LABELS, stage);
          return (
            <li key={stage} className="flex items-center">
              {index > 0 ? (
                <span
                  aria-hidden
                  className="mx-0.5 h-px w-3 shrink-0 bg-border-subtle sm:w-4"
                />
              ) : null}
              <button
                type="button"
                className={`jh-stage-chip flex max-w-[7.5rem] flex-col items-center gap-1 rounded-surface px-2 py-2 transition-colors hover:bg-surface-panel/80 sm:max-w-none sm:px-2.5 ${
                  count > 0 ? "" : "opacity-55"
                }`}
                onClick={() => {
                  if (view === "kanban" || view === "timeline") {
                    scrollToStage(stage);
                  } else {
                    document
                      .getElementById(`lead-list-${stage}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums text-white ${theme.dot}`}
                >
                  {count}
                </span>
                <span
                  className={`max-w-[4.75rem] truncate text-center text-[10px] font-medium leading-tight sm:max-w-[5.5rem] ${theme.accent}`}
                >
                  {short}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="space-y-2 rounded-surface bg-surface-elevated px-3 py-3 ring-1 ring-border-subtle/50 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">{progressStrip}</div>
          {viewToggle}
        </div>
        {canManage && view === "kanban" ? (
          <p className="border-t border-border-subtle/40 pt-2 text-[12px] text-text-secondary">
            Arrastra una tarjeta a otra etapa. Ganada y Perdida piden
            confirmación.
          </p>
        ) : null}
      </div>

      {view === "kanban" ? (
        <div
          ref={boardScrollRef}
          className="flex gap-3 overflow-x-auto px-0.5 pb-3 pt-2"
        >
          {PIPELINE_STAGES.map((stage) => {
            const items = localColumns[stage] ?? [];
            const theme = stageTheme(stage);
            const isDrop = dragOverStage === stage;
            return (
              <div
                key={stage}
                id={`lead-col-${stage}`}
                ref={(el) => {
                  columnRefs.current[stage] = el;
                }}
                onDragOver={(e) => onDragOverColumn(e, stage)}
                onDragLeave={() => {
                  setDragOverStage((cur) => (cur === stage ? null : cur));
                }}
                onDrop={(e) => onDropColumn(e, stage)}
                className={`flex w-[17.5rem] shrink-0 flex-col rounded-surface ring-1 transition-[ring-color,background-color] duration-200 ${theme.column} ${
                  isDrop ? `ring-2 ${theme.dropRing}` : ""
                }`}
              >
                <div className="px-4 pb-2 pt-3.5">
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${theme.accent}`}
                  >
                    {labelFor(OPPORTUNITY_STAGE_LABELS, stage)}
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold tabular-nums tracking-[-0.02em] text-ink">
                    {items.length}
                  </p>
                </div>
                <ul className="flex max-h-[70vh] flex-col gap-2.5 overflow-y-auto px-2.5 pb-3">
                  {items.map((opp) => {
                    const closed =
                      opp.stage === "WON" || opp.stage === "LOST";
                    const draggable = canManage && !closed;
                    return (
                      <li key={opp.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          draggable={draggable}
                          onDragStart={(e) => onDragStart(e, opp)}
                          onDrag={onDrag}
                          onDragEnd={onDragEnd}
                          onClick={() => openLead(opp.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openLead(opp.id);
                            }
                          }}
                          className={`jh-lead-card w-full cursor-pointer rounded-surface border border-border-subtle/60 bg-surface-elevated p-4 text-left transition-[transform,opacity] duration-200 ease-out hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                            draggable ? "cursor-grab active:cursor-grabbing" : ""
                          } ${
                            draggingId === opp.id ? "opacity-40" : ""
                          }`}
                          aria-label={`${clientName(opp)}, etapa ${labelFor(OPPORTUNITY_STAGE_LABELS, stage)}`}
                        >
                          <LeadCardFace opp={opp} stage={stage} />
                        </div>
                      </li>
                    );
                  })}
                  {items.length === 0 ? (
                    <li className="rounded-surface border border-dashed border-border-subtle/70 px-3 py-6 text-center text-[12px] text-text-secondary">
                      {canManage ? "Suelta aquí" : "Vacío"}
                    </li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}

      {view === "list" ? (
        <div className="space-y-4">
          {PIPELINE_STAGES.map((stage) => {
            const items = localColumns[stage] ?? [];
            const theme = stageTheme(stage);
            if (items.length === 0) return null;
            return (
              <section
                key={stage}
                id={`lead-list-${stage}`}
                className={`overflow-hidden rounded-surface ring-1 ${theme.column}`}
              >
                <header className="flex items-center justify-between gap-2 px-4 py-3">
                  <h2
                    className={`text-[13px] font-semibold tracking-[-0.01em] ${theme.accent}`}
                  >
                    {labelFor(OPPORTUNITY_STAGE_LABELS, stage)}
                  </h2>
                  <span className="text-[13px] font-semibold tabular-nums text-ink">
                    {items.length}
                  </span>
                </header>
                <ul className="divide-y divide-border-subtle/40 bg-surface-elevated/90">
                  {items.map((opp) => (
                    <li key={opp.id}>
                      <button
                        type="button"
                        className="jh-lead-card flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-nav-hover/40"
                        onClick={() => openLead(opp.id)}
                      >
                        <span
                          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ${theme.avatarWrap}`}
                          aria-hidden
                        >
                          <UserRound
                            className={`size-4 ${theme.avatarIcon}`}
                            strokeWidth={1.75}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
                            {clientName(opp)}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-text-secondary">
                            {[
                              opp.client.email,
                              opp.client.phone,
                              opp.owner?.name,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <Pill tone={theme.pill}>
                          {labelFor(OPPORTUNITY_STAGE_LABELS, stage)}
                        </Pill>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {flat.length === 0 ? (
            <p className="rounded-surface bg-surface-app px-4 py-8 text-center text-sm text-text-secondary">
              No hay leads todavía.
            </p>
          ) : null}
        </div>
      ) : null}

      {view === "timeline" ? (
        <div
          ref={boardScrollRef}
          className="overflow-x-auto pb-2"
        >
          <ol className="relative flex min-w-max items-start gap-0 px-2 py-4">
            <div
              aria-hidden
              className="absolute left-6 right-6 top-[2.15rem] h-px bg-border-subtle"
            />
            {PIPELINE_STAGES.map((stage) => {
              const items = localColumns[stage] ?? [];
              const theme = stageTheme(stage);
              return (
                <li
                  key={stage}
                  id={`lead-tl-${stage}`}
                  ref={(el) => {
                    columnRefs.current[stage] = el;
                  }}
                  className="relative z-[1] flex w-56 shrink-0 flex-col items-center px-2"
                >
                  <button
                    type="button"
                    className={`jh-stage-chip mb-3 flex flex-col items-center gap-1.5`}
                    onClick={() => scrollToStage(stage)}
                  >
                    <span
                      className={`flex size-9 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums text-white ${theme.dot}`}
                    >
                      {items.length}
                    </span>
                    <span
                      className={`max-w-[8rem] text-center text-[11px] font-semibold leading-snug ${theme.accent}`}
                    >
                      {labelFor(OPPORTUNITY_STAGE_LABELS, stage)}
                    </span>
                  </button>
                  <ul className="flex w-full flex-col gap-2">
                    {items.map((opp) => (
                      <li key={opp.id}>
                        <button
                          type="button"
                          onClick={() => openLead(opp.id)}
                          className="jh-lead-card w-full rounded-surface border border-border-subtle/60 bg-surface-elevated p-3 text-left transition-transform hover:-translate-y-px motion-reduce:hover:translate-y-0"
                        >
                          <LeadCardFace opp={opp} stage={stage} dense />
                        </button>
                      </li>
                    ))}
                    {items.length === 0 ? (
                      <li className="rounded-surface border border-dashed border-border-subtle/60 px-2 py-4 text-center text-[11px] text-text-secondary">
                        —
                      </li>
                    ) : null}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <Modal
        open={selected != null}
        onClose={() => setSelectedId(null)}
        title={selected ? clientName(selected) : "Lead"}
        description={
          selected
            ? `${selected.client.clientCode} · ${labelFor(
                OPPORTUNITY_STAGE_LABELS,
                selected.stage,
              )}`
            : undefined
        }
        size="md"
        footer={
          selected ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <ButtonLink
                href={`/crm/clientes/${selected.client.id}`}
                size="sm"
                variant="secondary"
              >
                Ver ficha
              </ButtonLink>
              <div className="flex flex-wrap gap-2">
                {canEditLead &&
                selected.stage !== "WON" &&
                selected.stage !== "LOST" ? (
                  <EditLeadButton
                    lead={selected}
                    members={members}
                    canEdit={canEditLead}
                  />
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedId(null)}
                >
                  Cerrar
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {selected && selectedIntent ? (
          <div className="space-y-5 text-sm">
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex size-12 shrink-0 items-center justify-center rounded-full ring-1 ${
                  stageTheme(selected.stage).avatarWrap
                }`}
                aria-hidden
              >
                <UserRound
                  className={`size-5 ${stageTheme(selected.stage).avatarIcon}`}
                  strokeWidth={1.75}
                />
              </span>
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone={stageTheme(selected.stage).pill}>
                    {labelFor(OPPORTUNITY_STAGE_LABELS, selected.stage)}
                  </Pill>
                  {selectedIntent.isCreditAnalysis ? (
                    <Pill tone="amber">Análisis de crédito</Pill>
                  ) : selectedIntent.isWebsiteContact ? (
                    <Pill tone="blue">Formulario web</Pill>
                  ) : (
                    <Pill tone="slate">CRM</Pill>
                  )}
                </div>
                <p className="text-xs text-text-secondary">
                  Registrado{" "}
                  {formatDateTime(
                    selected.client.createdAt ??
                      selected.createdAt ??
                      new Date(),
                  )}
                  {selected.owner?.name ? ` · ${selected.owner.name}` : ""}
                </p>
              </div>
            </div>

            <dl className="grid gap-3 rounded-surface border border-border-subtle/60 bg-surface-app/50 px-3.5 py-3.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-secondary">
                  <MapPin className="size-3.5" aria-hidden />
                  De dónde se registró
                </dt>
                <dd className="mt-1 text-[13px] font-medium leading-snug text-ink">
                  {selectedIntent.originLabel}
                </dd>
                {selected.client.leadChannel ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Canal:{" "}
                    {labelFor(
                      LEAD_CHANNEL_LABELS,
                      selected.client.leadChannel,
                    )}
                  </p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-secondary">
                  <Sparkles className="size-3.5" aria-hidden />
                  Qué quieren
                </dt>
                <dd className="mt-1 text-[13px] font-medium leading-snug text-ink">
                  {selectedIntent.intentLabel}
                </dd>
              </div>
              {selected.client.email ? (
                <div>
                  <dt className="text-[11px] text-text-secondary">Correo</dt>
                  <dd className="mt-0.5 break-all text-[13px] text-ink">
                    {selected.client.email}
                  </dd>
                </div>
              ) : null}
              {selected.client.phone ? (
                <div>
                  <dt className="text-[11px] text-text-secondary">Teléfono</dt>
                  <dd className="mt-0.5 text-[13px] text-ink">
                    {selected.client.phone}
                  </dd>
                </div>
              ) : null}
              {selected.estimatedValue ? (
                <div>
                  <dt className="text-[11px] text-text-secondary">
                    Valor estimado
                  </dt>
                  <dd className="mt-0.5 tabular-nums text-[13px] text-ink">
                    {formatMoney(selected.estimatedValue)}
                  </dd>
                </div>
              ) : null}
              {selected.nextFollowUpAt ? (
                <div>
                  <dt className="text-[11px] text-text-secondary">
                    Seguimiento
                  </dt>
                  <dd className="mt-0.5 text-[13px] text-ink">
                    {formatDate(selected.nextFollowUpAt)}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold tracking-[-0.01em] text-ink">
                <MessageSquareText
                  className="size-4 text-text-secondary"
                  aria-hidden
                />
                Historial de mensajes
              </h3>

              {canManage ? (
                <div className="mb-3 space-y-2 rounded-surface border border-border-subtle/60 bg-surface-app/40 p-3">
                  <Field
                    label="Nuevo mensaje"
                    htmlFor="lead-message-draft"
                  >
                    <Textarea
                      id="lead-message-draft"
                      value={messageDraft}
                      onChange={(e) => setMessageDraft(e.target.value)}
                      rows={3}
                      maxLength={5000}
                      placeholder="Ej. Llamé al cliente, pidió más info del análisis…"
                    />
                  </Field>
                  {messageError ? (
                    <Alert tone="error">{messageError}</Alert>
                  ) : null}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending || !messageDraft.trim()}
                      onClick={submitLeadMessage}
                    >
                      {pending ? "Guardando…" : "Agregar mensaje"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {historyMessages.length === 0 ? (
                <p className="rounded-surface bg-surface-app/60 px-3 py-3 text-xs text-text-secondary">
                  Aún no hay mensajes. Agrega el primero para dejar historial.
                </p>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
                  {historyMessages.map((msg) => (
                    <li
                      key={msg.id}
                      className="rounded-surface border border-border-subtle/50 bg-surface-elevated px-3.5 py-3"
                    >
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary-strong">
                        {msg.body}
                      </p>
                      <p className="mt-2 text-[11px] tabular-nums text-text-secondary">
                        {formatDateTime(msg.at)}
                        {msg.authorName ? ` · ${msg.authorName}` : ""}
                        {msg.kind === "consultation"
                          ? " · Formulario"
                          : msg.kind === "note"
                            ? " · Nota"
                            : " · Actividad"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(() => {
              // Fase 4: enlace canónico wonServiceCase; wonCase es legacy.
              const wonCreditCase =
                selected.wonCase ?? selected.wonServiceCase?.creditCase ?? null;
              return wonCreditCase ? (
                <Link
                  href={`/crm/casos/${wonCreditCase.id}`}
                  className="inline-flex text-sm font-medium text-action-primary hover:text-action-secondary"
                >
                  Caso {wonCreditCase.caseCode}
                </Link>
              ) : null;
            })()}

            {canManage &&
            selected.stage !== "WON" &&
            selected.stage !== "LOST" ? (
              <div className="space-y-2 border-t border-border-subtle/60 pt-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-secondary">
                  Acciones
                </p>
                <Select
                  className="text-sm"
                  disabled={pending}
                  defaultValue=""
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    requestMove(selected.id, next);
                    e.target.value = "";
                  }}
                >
                  <option value="">Mover a…</option>
                  {MOVE_STAGES.filter((s) => s !== selected.stage).map((s) => (
                    <option key={s} value={s}>
                      {labelFor(OPPORTUNITY_STAGE_LABELS, s)}
                    </option>
                  ))}
                </Select>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="success"
                    disabled={pending}
                    className="flex-1"
                    onClick={() => {
                      setWonServiceCode(
                        resolveWonServiceCode(
                          null,
                          selected.client.serviceRequested,
                        ),
                      );
                      setWonFor(selected.id);
                    }}
                  >
                    Ganada
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    className="flex-1"
                    onClick={() => {
                      setLostReason("");
                      setLostFor(selected.id);
                    }}
                  >
                    Perdida
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(wonFor)}
        onClose={() => {
          if (pending) return;
          setWonFor(null);
        }}
        title="Marcar como ganada"
        description={
          wonTarget
            ? `Conversión de ${clientName(wonTarget)}: se abre el expediente del servicio elegido.`
            : "Se abrirá el expediente del servicio elegido."
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setWonFor(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              variant="success"
              disabled={pending || !wonFor}
              onClick={() => {
                if (!wonFor) return;
                run(async () => {
                  const result = await markOpportunityWonAction(wonFor, {
                    serviceCode: wonServiceCode,
                  });
                  if (result.ok) {
                    setWonFor(null);
                    // Mantener detalle abierto: tras refresh verá el enlace al caso.
                  }
                  return result;
                });
              }}
            >
              {pending ? "Procesando…" : "Marcar ganada"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Servicio del expediente" htmlFor="won-service">
            <Select
              id="won-service"
              value={wonServiceCode}
              onChange={(e) => setWonServiceCode(e.target.value)}
              disabled={pending}
            >
              {wonServiceOptions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-text-secondary-strong">
            <li>No se duplica el cliente ni se borra el lead.</li>
            <li>
              Se crea ServiceCase OPEN del servicio elegido
              {wonServiceCode === "CREDIT_REPAIR"
                ? " (con CreditCase 1:1)"
                : " (sin CreditCase)"}
              .
            </li>
            <li>La oportunidad queda Ganada y enlazada al expediente.</li>
            <li>
              Si el cliente estaba en LEAD, pasa a ACTIVE. La fuente original se
              conserva.
            </li>
          </ul>
        </div>
      </Modal>

      <Modal
        open={Boolean(lostFor)}
        onClose={() => {
          if (pending) return;
          setLostFor(null);
        }}
        title="Marcar como perdida"
        description="Esta acción cierra el deal. Indica el motivo para el historial comercial."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!lostFor) return;
            run(async () => {
              const result = await markOpportunityLostAction(lostFor, {
                lostReason,
              });
              if (result.ok) {
                setLostFor(null);
                setSelectedId(null);
              }
              return result;
            });
          }}
        >
          <Field label="Motivo" htmlFor="lost-reason" required>
            <Textarea
              id="lost-reason"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              required
              maxLength={2000}
              placeholder="Ej. Sin respuesta, eligió otra opción, presupuesto…"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setLostFor(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={pending || !lostReason.trim()}
            >
              {pending ? "Guardando…" : "Marcar perdida"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
