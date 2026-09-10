"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import Link from "next/link";
import {
  AlignVerticalJustifyCenter,
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  Briefcase,
  CalendarDays,
  Circle,
  CircleCheck,
  ClipboardList,
  Compass,
  DoorOpen,
  FileText,
  FileUp,
  FileX,
  Inbox,
  LineChart,
  Link2,
  Lock,
  Mail,
  MapPin,
  MessagesSquare,
  Orbit,
  PenLine,
  PenTool,
  Pencil,
  Receipt,
  RefreshCw,
  ScanSearch,
  ScrollText,
  Search,
  Send,
  Sparkles,
  Sprout,
  SquareCheck,
  StickyNote,
  Swords,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  Wrench,
  type LucideProps,
} from "lucide-react";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Modal,
  Pill,
} from "@/src/components/ui";
import { History } from "lucide-react";
import { formatDateTime } from "@/src/lib/format";
import { ACTIVITY_TYPE_LABELS, labelFor } from "@/src/lib/labels";
import {
  getActivityVisual,
  resolveActivityLinks,
  type ActivityIconName,
} from "@/src/lib/activity-timeline";

export type TimelineEvent = {
  id: string;
  type: string;
  description: string;
  createdAt: Date | string;
  caseId?: string | null;
  roundId?: string | null;
  serviceCaseId?: string | null;
  metadata?: unknown;
  actor?: { name: string | null; email?: string | null } | null;
  case?: { caseCode: string; summary?: string | null } | null;
  serviceCase?: {
    caseNumber: string;
    notes?: string | null;
    service?: { name: string } | null;
  } | null;
  round?: { roundNumber: number } | null;
};

type Orientation = "vertical" | "horizontal";

const DESKTOP_MQ = "(min-width: 640px)";

const ICONS: Record<ActivityIconName, ComponentType<LucideProps>> = {
  sparkles: Sparkles,
  "sticky-note": StickyNote,
  "refresh-cw": RefreshCw,
  "map-pin": MapPin,
  "file-up": FileUp,
  "file-x": FileX,
  "trash-2": Trash2,
  orbit: Orbit,
  send: Send,
  "circle-check": CircleCheck,
  "square-check": SquareCheck,
  "badge-check": BadgeCheck,
  briefcase: Briefcase,
  upload: Upload,
  banknote: Banknote,
  receipt: Receipt,
  "calendar-days": CalendarDays,
  "messages-square": MessagesSquare,
  mail: Mail,
  inbox: Inbox,
  "line-chart": LineChart,
  "trending-up": TrendingUp,
  swords: Swords,
  wrench: Wrench,
  search: Search,
  "scan-search": ScanSearch,
  "pen-line": PenLine,
  pencil: Pencil,
  "scroll-text": ScrollText,
  "clipboard-list": ClipboardList,
  sprout: Sprout,
  compass: Compass,
  trophy: Trophy,
  link: Link2,
  "door-open": DoorOpen,
  lock: Lock,
  "file-text": FileText,
  "pen-tool": PenTool,
  circle: Circle,
};

function ActivityIcon({
  name,
  className,
}: {
  name: ActivityIconName;
  className?: string;
}) {
  const Icon = ICONS[name] ?? Circle;
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

/**
 * Línea de tiempo interactiva (HIG): iconos Lucide peso uniforme,
 * color intenso por categoría, selector segmentado en el header.
 */
export function ActivityTimeline({
  clientId,
  clientName,
  events,
}: {
  clientId: string;
  clientName: string;
  events: TimelineEvent[];
}) {
  // Mismo valor en SSR y primer paint del cliente (evita hydration mismatch).
  // Tras montar: horizontal en desktop, vertical en móvil.
  const [orientation, setOrientation] = useState<Orientation>("vertical");
  const [orientationTouched, setOrientationTouched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    function syncDefault() {
      if (orientationTouched) return;
      setOrientation(mq.matches ? "horizontal" : "vertical");
    }
    syncDefault();
    mq.addEventListener("change", syncDefault);
    return () => mq.removeEventListener("change", syncDefault);
  }, [orientationTouched]);

  const selected = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId],
  );

  const selectedVisual = selected ? getActivityVisual(selected.type) : null;
  const selectedLinks = selected
    ? resolveActivityLinks({
        type: selected.type,
        clientId,
        caseId: selected.caseId,
        roundId: selected.roundId,
        metadata: selected.metadata,
      })
    : [];
  const selectedActorLabel = selected
    ? selected.actor?.name?.trim() || selected.actor?.email || "Sistema"
    : null;
  const selectedCaseLabel = selected
    ? selected.case?.caseCode || selected.serviceCase?.caseNumber || null
    : null;
  const selectedServiceName = selected?.serviceCase?.service?.name ?? null;
  const selectedCaseSummary =
    selected?.case?.summary?.trim() ||
    selected?.serviceCase?.notes?.trim() ||
    null;

  return (
    <Card>
      <CardHeader
        title="Línea de tiempo"
        description="Eventos del cliente intercalados. Haz clic en un evento para ver el detalle y saltar a la sección relacionada."
        actions={
          <div
            className="inline-flex rounded-control border border-border-subtle bg-surface-panel/60 p-0.5"
            role="group"
            aria-label="Orientación de la línea de tiempo"
          >
            <Button
              type="button"
              size="sm"
              variant={orientation === "vertical" ? "secondary" : "ghost"}
              onClick={() => {
                setOrientationTouched(true);
                setOrientation("vertical");
              }}
              aria-pressed={orientation === "vertical"}
              className="min-h-9 gap-1.5 px-2.5"
            >
              <AlignVerticalJustifyCenter className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Vertical</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={orientation === "horizontal" ? "secondary" : "ghost"}
              onClick={() => {
                setOrientationTouched(true);
                setOrientation("horizontal");
              }}
              aria-pressed={orientation === "horizontal"}
              className="min-h-9 gap-1.5 px-2.5"
            >
              <ArrowLeftRight className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Horizontal</span>
            </Button>
          </div>
        }
      />

      {events.length === 0 ? (
        <div className="px-5 py-6">
          <EmptyState
            icon={History}
            title="Sin actividad"
            description="Aún no hay eventos registrados para este cliente."
          />
        </div>
      ) : (
        <div className="px-4 py-4 sm:px-5">
          {orientation === "vertical" ? (
            <VerticalTimeline events={events} onSelect={setSelectedId} />
          ) : (
            <HorizontalTimeline events={events} onSelect={setSelectedId} />
          )}
        </div>
      )}

      <Modal
        open={selected != null}
        onClose={() => setSelectedId(null)}
        title={
          selected
            ? labelFor(ACTIVITY_TYPE_LABELS, selected.type)
            : "Actividad"
        }
        description={
          selected ? formatDateTime(selected.createdAt) : undefined
        }
        footer={
          selectedLinks.length > 0 ? (
            <div className="flex w-full flex-wrap gap-2">
              {selectedLinks.map((l) => (
                <ButtonLink
                  key={l.href}
                  href={l.href}
                  size="sm"
                  variant="secondary"
                >
                  {l.label}
                </ButtonLink>
              ))}
            </div>
          ) : undefined
        }
      >
        {selected && selectedVisual ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex size-9 items-center justify-center rounded-full ring-1 ${selectedVisual.nodeClass}`}
              >
                <ActivityIcon
                  name={selectedVisual.icon}
                  className={`size-4 ${selectedVisual.iconClass}`}
                />
              </span>
              <Pill tone={selectedVisual.tone}>{selectedVisual.label}</Pill>
            </div>

            <p className="leading-relaxed text-text-secondary-strong whitespace-pre-wrap">
              {selected.description}
            </p>

            <dl className="grid gap-3 rounded-control border border-border-subtle/70 bg-surface-app/60 px-3 py-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-text-secondary">Cliente</dt>
                <dd className="mt-0.5 font-medium text-ink">{clientName}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">Usuario</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selectedActorLabel}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">Fecha</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-ink">
                  {formatDateTime(selected.createdAt)}
                </dd>
              </div>
              {selectedCaseLabel || selectedServiceName ? (
                <div>
                  <dt className="text-text-secondary">Caso</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {selectedCaseLabel}
                    {selectedServiceName ? (
                      <span className="font-normal text-text-secondary">
                        {selectedCaseLabel ? " · " : ""}
                        {selectedServiceName}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ) : null}
              {selected.round?.roundNumber != null ? (
                <div>
                  <dt className="text-text-secondary">Ronda</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    Ronda {selected.round.roundNumber}
                  </dd>
                </div>
              ) : null}
              {selectedCaseSummary ? (
                <div className="sm:col-span-2">
                  <dt className="text-text-secondary">Resumen del caso</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap font-medium leading-relaxed text-ink">
                    {selectedCaseSummary}
                  </dd>
                </div>
              ) : null}
            </dl>

            {selectedLinks.length === 0 ? (
              <p className="text-xs text-text-secondary">
                Sin sección relacionada directa.{" "}
                <Link
                  href={`/crm/clientes/${clientId}`}
                  className="font-medium text-action-primary hover:text-action-secondary"
                  onClick={() => setSelectedId(null)}
                >
                  Ir al resumen
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}

/** Detecta si hay overflow y si aún queda contenido en el extremo “final”. */
function useScrollOverflowHint(axis: "x" | "y", itemCount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [showEndFade, setShowEndFade] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function update() {
      if (!el) return;
      if (axis === "x") {
        const { scrollLeft, scrollWidth, clientWidth } = el;
        setShowEndFade(scrollWidth - clientWidth - scrollLeft > 4);
      } else {
        const { scrollTop, scrollHeight, clientHeight } = el;
        setShowEndFade(scrollHeight - clientHeight - scrollTop > 4);
      }
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Contenido interno (cards) puede cambiar de alto/ancho.
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [axis, itemCount]);

  return { ref, showEndFade };
}

function TimelineNode({
  event,
  onSelect,
}: {
  event: TimelineEvent;
  onSelect: (id: string) => void;
}) {
  const visual = getActivityVisual(event.type);
  return (
    <button
      type="button"
      onClick={() => onSelect(event.id)}
      className={`relative z-10 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full ring-1 transition-[transform,box-shadow] duration-200 ease-out hover:scale-[1.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary motion-reduce:transition-none motion-reduce:hover:scale-100 ${visual.nodeClass}`}
      aria-label={`${labelFor(ACTIVITY_TYPE_LABELS, event.type)}: ver detalle`}
    >
      <ActivityIcon
        name={visual.icon}
        className={`size-[17px] ${visual.iconClass}`}
      />
    </button>
  );
}

function VerticalTimeline({
  events,
  onSelect,
}: {
  events: TimelineEvent[];
  onSelect: (id: string) => void;
}) {
  const { ref, showEndFade } = useScrollOverflowHint("y", events.length);

  return (
    <div className="relative">
      <div
        ref={ref}
        className="max-h-[min(70vh,36rem)] overflow-y-auto overscroll-y-contain"
      >
        <ol className="relative mx-auto max-w-4xl py-2">
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-2 left-1/2 top-2 w-px -translate-x-1/2 bg-gradient-to-b from-border-subtle via-border-subtle to-transparent"
          />
          {events.map((event, index) => {
            const visual = getActivityVisual(event.type);
            const onLeft = index % 2 === 0;
            return (
              <li
                key={event.id}
                className="relative grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-start gap-x-2 py-5 sm:gap-x-4"
              >
                {/* Columna izquierda */}
                <div className="flex justify-end pr-1 sm:pr-2">
                  {onLeft ? (
                    <EventCard
                      event={event}
                      visual={visual}
                      align="right"
                      onOpen={() => onSelect(event.id)}
                    />
                  ) : (
                    <span className="hidden w-full sm:block" aria-hidden />
                  )}
                </div>

                {/* Nodo central */}
                <div className="relative z-10 flex justify-center pt-1">
                  <TimelineNode event={event} onSelect={onSelect} />
                </div>

                {/* Columna derecha */}
                <div className="flex justify-start pl-1 sm:pl-2">
                  {!onLeft ? (
                    <EventCard
                      event={event}
                      visual={visual}
                      align="left"
                      onOpen={() => onSelect(event.id)}
                    />
                  ) : (
                    <span className="hidden w-full sm:block" aria-hidden />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {showEndFade ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[var(--color-surface-elevated)] to-transparent"
        />
      ) : null}
    </div>
  );
}

function HorizontalTimeline({
  events,
  onSelect,
}: {
  events: TimelineEvent[];
  onSelect: (id: string) => void;
}) {
  const { ref, showEndFade } = useScrollOverflowHint("x", events.length);

  return (
    <div className="relative -mx-1">
      <div
        ref={ref}
        className="overflow-x-auto overscroll-x-contain px-1 pb-2"
      >
        <ol className="relative flex min-w-max items-stretch gap-0 px-4 py-6">
          <div
            aria-hidden
            className="absolute left-4 right-4 top-1/2 h-px -translate-y-1/2 bg-border-subtle"
          />
          {events.map((event, index) => {
            const visual = getActivityVisual(event.type);
            const above = index % 2 === 0;
            return (
              <li
                key={event.id}
                className="relative flex w-52 shrink-0 flex-col items-center"
              >
                <div
                  className={`flex h-36 w-full flex-col justify-end px-2 ${
                    above ? "visible" : "invisible"
                  }`}
                >
                  {above ? (
                    <EventCard
                      event={event}
                      visual={visual}
                      align="center"
                      compact
                      onOpen={() => onSelect(event.id)}
                    />
                  ) : null}
                </div>

                <div className="relative z-10 my-2">
                  <TimelineNode event={event} onSelect={onSelect} />
                </div>

                <div
                  className={`flex h-36 w-full flex-col justify-start px-2 ${
                    above ? "invisible" : "visible"
                  }`}
                >
                  {!above ? (
                    <EventCard
                      event={event}
                      visual={visual}
                      align="center"
                      compact
                      onOpen={() => onSelect(event.id)}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {showEndFade ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-[var(--color-surface-elevated)] to-transparent"
        />
      ) : null}
    </div>
  );
}

function EventCard({
  event,
  visual,
  align,
  compact = false,
  onOpen,
}: {
  event: TimelineEvent;
  visual: ReturnType<typeof getActivityVisual>;
  align: "left" | "right" | "center";
  compact?: boolean;
  onOpen: () => void;
}) {
  const alignClass =
    align === "right"
      ? "items-end text-right"
      : align === "center"
        ? "items-center text-center"
        : "items-start text-left";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex w-full max-w-full cursor-pointer flex-col gap-1 rounded-control border bg-surface-elevated/95 px-3 py-2.5 text-left transition-colors duration-200 ease-out hover:bg-nav-hover/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary ${visual.accentClass} ${
        compact ? "max-w-[12.5rem]" : ""
      } ${alignClass}`}
    >
      <span className="inline-flex">
        <Pill tone={visual.tone}>
          {labelFor(ACTIVITY_TYPE_LABELS, event.type)}
        </Pill>
      </span>
      <span
        className={`line-clamp-2 text-[13px] font-medium leading-snug tracking-[-0.01em] text-ink ${
          align === "right"
            ? "text-right"
            : align === "center"
              ? "text-center"
              : "text-left"
        }`}
      >
        {event.description}
      </span>
      <span
        className={`text-[11px] tabular-nums text-text-secondary ${
          align === "right"
            ? "text-right"
            : align === "center"
              ? "text-center"
              : "text-left"
        }`}
      >
        {formatDateTime(event.createdAt)}
        {event.actor?.name ? ` · ${event.actor.name}` : ""}
      </span>
    </button>
  );
}
