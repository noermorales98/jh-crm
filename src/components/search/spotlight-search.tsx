"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  Briefcase,
  ClipboardList,
  CreditCard,
  FileSignature,
  FileText,
  Home,
  Mail,
  MessageCircle,
  MessageSquareQuote,
  Package,
  Receipt,
  RefreshCcw,
  Search,
  Settings,
  Sparkles,
  Target,
  UserCog,
  Users,
  CalendarClock,
  Cpu,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { play } from "cuelume";
import { startAskAiChat } from "@/src/components/ai/ask-ai";
import {
  aiPromptFromQuery,
  groupSpotlightHits,
  isAiIntent,
  matchCatalog,
  mergeSpotlightHits,
  type SpotlightHit,
  type SpotlightKind,
} from "@/src/lib/search/spotlight";
import { SPOTLIGHT_OPEN_EVENT } from "@/src/components/search/spotlight-events";

const RECENT_KEY = "jh-spotlight-recent";
const RECENT_MAX = 6;

const KIND_ICON: Record<SpotlightKind, LucideIcon> = {
  ai: Sparkles,
  page: Home,
  setting: Settings,
  client: Users,
  opportunity: Target,
  case: Briefcase,
  round: RefreshCcw,
  task: ClipboardList,
  service: Package,
  package: Package,
  quote: FileText,
  payment: CreditCard,
  plan: Wallet,
  receipt: Receipt,
  consultation: CalendarClock,
  contract: FileSignature,
  testimonial: MessageSquareQuote,
  processor: Cpu,
  mail: Mail,
  user: UserCog,
};

function iconFor(hit: SpotlightHit): LucideIcon {
  if (hit.kind !== "page" && hit.kind !== "setting") return KIND_ICON[hit.kind];
  const href = hit.href ?? "";
  if (href.includes("/oportunidades")) return Target;
  if (href.includes("/clientes")) return Users;
  if (href.includes("/casos")) return Briefcase;
  if (href.includes("/rondas")) return RefreshCcw;
  if (href.includes("/tareas")) return ClipboardList;
  if (href.includes("/consultas")) return CalendarClock;
  if (href.includes("/servicios")) return Package;
  if (href.includes("/cotizaciones")) return FileText;
  if (href.includes("/planes-pago")) return Wallet;
  if (href.includes("/pagos")) return CreditCard;
  if (href.includes("/recibos")) return Receipt;
  if (href.includes("/mails")) return Mail;
  if (href.includes("/chats")) return MessageCircle;
  if (href.includes("/testimonios")) return MessageSquareQuote;
  if (href.includes("/contratos")) return FileSignature;
  if (href.includes("/procesadores")) return Cpu;
  if (href.includes("/usuarios")) return UserCog;
  if (href.includes("/configuracion") || href.includes("/auditoria")) return Settings;
  return Home;
}

function readRecents(): SpotlightHit[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is SpotlightHit =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as SpotlightHit).id === "string" &&
        typeof (row as SpotlightHit).title === "string",
    );
  } catch {
    return [];
  }
}

function writeRecent(hit: SpotlightHit) {
  if (hit.kind === "ai") return;
  const next = [
    hit,
    ...readRecents().filter((row) => row.id !== hit.id),
  ].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // privado / cuota
  }
}

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function SpotlightSearch({ role }: { role: Role | null }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<SpotlightHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [recents, setRecents] = useState<SpotlightHit[]>([]);
  const [assisted, setAssisted] = useState(false);
  const [assistSummary, setAssistSummary] = useState<string | null>(null);
  const shortcut = isMac() ? "⌘K" : "Ctrl K";

  const useAssist = assisted || isAiIntent(query);

  const localHits = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const pages = matchCatalog("", role);
      return mergeSpotlightHits([recents.map((hit) => ({ ...hit, score: 90 })), pages], "");
    }
    return mergeSpotlightHits([matchCatalog(q, role), remote], q);
  }, [query, role, recents, remote]);

  const grouped = useMemo(() => groupSpotlightHits(localHits), [localHits]);
  const flat = localHits;
  const activeHit = flat[active] ?? null;

  const close = useCallback(() => {
    setQuery("");
    setRemote([]);
    setError(null);
    setAssistSummary(null);
    setActive(0);
    setOpen(false);
    dialogRef.current?.close();
  }, []);

  const openPalette = useCallback(() => {
    setRecents(readRecents());
    setOpen(true);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    requestAnimationFrame(() => overlayInputRef.current?.focus());
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("textarea, [contenteditable='true']")) return;
      event.preventDefault();
      if (dialogRef.current?.open) close();
      else openPalette();
    }
    function onOpenRequest() {
      openPalette();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(SPOTLIGHT_OPEN_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SPOTLIGHT_OPEN_EVENT, onOpenRequest);
    };
  }, [close, openPalette]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      const resetTimer = window.setTimeout(() => {
        setRemote([]);
        setLoading(false);
        setError(null);
        setAssistSummary(null);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    // Feedback inmediato mientras corre el debounce + fetch.
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        if (useAssist) {
          const res = await fetch("/api/crm/search/assist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q }),
            signal: controller.signal,
            cache: "no-store",
          });
          const data = (await res.json()) as {
            ok?: boolean;
            hits?: SpotlightHit[];
            summary?: string;
            error?: string;
          };
          if (!res.ok || !data.ok) {
            // Fallback keyword si la IA no está disponible.
            const kw = await fetch(`/api/crm/search?q=${encodeURIComponent(q)}`, {
              signal: controller.signal,
              cache: "no-store",
            });
            const kwData = (await kw.json()) as {
              ok?: boolean;
              hits?: SpotlightHit[];
              error?: string;
            };
            if (!kw.ok || !kwData.ok) {
              throw new Error(data.error ?? kwData.error ?? "No se pudo buscar.");
            }
            setRemote(kwData.hits ?? []);
            setActive(0);
            setAssistSummary(
              data.error
                ? `Asistida no disponible (${data.error}). Mostrando coincidencias por texto.`
                : "Asistida no disponible. Mostrando coincidencias por texto.",
            );
            setError(null);
          } else {
            setRemote(data.hits ?? []);
            setActive(0);
            setAssistSummary(data.summary ?? null);
            setError(null);
          }
        } else {
          const res = await fetch(`/api/crm/search?q=${encodeURIComponent(q)}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          const data = (await res.json()) as {
            ok?: boolean;
            hits?: SpotlightHit[];
            error?: string;
          };
          if (!res.ok || !data.ok) {
            throw new Error(data.error ?? "No se pudo buscar.");
          }
          setRemote(data.hits ?? []);
          setActive(0);
          setAssistSummary(null);
          setError(null);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "No se pudo buscar.");
        setAssistSummary(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, useAssist ? 320 : 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, useAssist]);

  useEffect(() => {
    const node = listRef.current?.querySelector("[data-active='true']");
    node?.scrollIntoView({ block: "nearest" });
  }, [active, flat]);

  const crmHits = useMemo(
    () => flat.filter((hit) => hit.kind !== "ai"),
    [flat],
  );
  const aiHit = useMemo(
    () => flat.find((hit) => hit.kind === "ai") ?? null,
    [flat],
  );
  const hasCrmResults = crmHits.length > 0;
  const searchingDb = loading && query.trim().length >= 2;
  const showEmptyCrm =
    query.trim().length >= 2 && !searchingDb && !error && !hasCrmResults;

  function ask(text: string) {
    const prompt = aiPromptFromQuery(text) || "Ayúdame con el CRM.";
    const href = startAskAiChat(prompt);
    play("press");
    close();
    if (href) router.push(href);
  }

  function go(hit: SpotlightHit) {
    if (hit.kind === "ai") {
      ask(query);
      return;
    }
    if (!hit.href) return;
    writeRecent(hit);
    play("tick");
    close();
    router.push(hit.href);
  }

  const gridCols = 2;

  function onOverlayKey(event: React.KeyboardEvent<HTMLInputElement>) {
    const last = Math.max(0, flat.length - 1);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + gridCols, last));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - gridCols, 0));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, last));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        ask(query);
        return;
      }
      if (activeHit) go(activeHit);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  return (
    <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-4">
      <button
        type="button"
        onClick={openPalette}
        aria-label="Buscar en el CRM"
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        className="jh-spotlight-field flex h-11 w-full max-w-2xl items-center gap-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-surface-elevated)_78%,transparent)] px-4 text-left text-[15px] text-text-secondary ring-1 ring-border-subtle/40 backdrop-blur-xl transition-colors hover:bg-[color-mix(in_srgb,var(--color-surface-elevated)_92%,transparent)] focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 lg:h-12 lg:px-5 motion-reduce:transition-none"
      >
        <Search className="size-[18px] shrink-0 text-text-secondary-strong" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Buscar o preguntar…</span>
        <kbd className="hidden rounded-md border border-border-subtle/70 bg-[color-mix(in_srgb,var(--color-surface-elevated)_55%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-text-secondary sm:inline">
          {shortcut}
        </kbd>
      </button>

      <dialog
        ref={dialogRef}
        className="jh-spotlight w-[min(52rem,calc(100vw-1.25rem))] overflow-hidden rounded-[28px] p-0 text-ink ring-1 ring-border-subtle/40 jh-overlay-shadow"
        aria-label="Búsqueda universal"
        onClose={() => {
          setQuery("");
          setRemote([]);
          setError(null);
          setAssistSummary(null);
          setActive(0);
          setOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-3 rounded-full bg-[color-mix(in_srgb,var(--color-surface-elevated)_55%,transparent)] px-4 ring-1 ring-border-subtle/35">
            <Search className="size-5 shrink-0 text-text-secondary-strong" aria-hidden />
            <input
              ref={overlayInputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onOverlayKey}
              placeholder="Clientes, rondas, cuotas, páginas o una pregunta…"
              aria-label="Buscar en el CRM"
              aria-controls={listId}
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              className="jh-spotlight-field min-h-12 min-w-0 flex-1 bg-transparent text-[17px] text-ink placeholder:text-text-placeholder focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
            />
            {query ? (
              <button
                type="button"
                className="jh-spotlight-field flex size-8 items-center justify-center rounded-full text-text-secondary hover:bg-nav-hover hover:text-ink focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  setQuery("");
                  overlayInputRef.current?.focus();
                }}
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
            {loading || searchingDb ? (
              <span className="text-[12px] font-medium text-action-primary" role="status">
                {useAssist ? "Asistiendo…" : "Buscando…"}
              </span>
            ) : (
              <kbd className="hidden text-[12px] text-text-secondary sm:inline">esc</kbd>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => setAssisted((value) => !value)}
              aria-pressed={assisted}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                useAssist
                  ? "bg-action-primary text-action-primary-foreground"
                  : "bg-[color-mix(in_srgb,var(--color-surface-elevated)_60%,transparent)] text-text-secondary ring-1 ring-border-subtle/50 hover:bg-nav-hover hover:text-ink"
              }`}
            >
              <Sparkles className="size-3.5" aria-hidden />
              Asistida
            </button>
            <span className="text-[12px] text-text-secondary">
              {useAssist
                ? "NL → resultados del CRM"
                : "Texto exacto · activa Asistida o escribe una pregunta"}
            </span>
          </div>
        </div>

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Resultados"
          className="max-h-[min(36rem,68vh)] overflow-y-auto px-3 pb-3 sm:px-4"
        >
          {assistSummary ? (
            <p className="mb-3 rounded-[14px] bg-[color-mix(in_srgb,var(--color-surface-elevated)_55%,transparent)] px-3 py-2.5 text-[13px] text-text-secondary ring-1 ring-border-subtle/40">
              <span className="font-medium text-ink">Sugerencia de IA · </span>
              {assistSummary}
            </p>
          ) : null}
          {error ? (
            <p className="px-3 py-4 text-sm text-danger-ink">{error}</p>
          ) : null}

          {searchingDb ? (
            <p
              className="mb-3 flex items-center gap-2 rounded-[14px] bg-[color-mix(in_srgb,var(--color-surface-elevated)_55%,transparent)] px-3 py-3 text-[14px] font-medium text-ink ring-1 ring-border-subtle/40"
              role="status"
              aria-live="polite"
            >
              <span
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-border-subtle border-t-action-primary motion-reduce:animate-none"
                aria-hidden
              />
              {useAssist ? "Asistiendo con la búsqueda…" : "Buscando en el CRM…"}
            </p>
          ) : null}

          {showEmptyCrm ? (
            <div className="space-y-3 px-1 py-2">
              <p className="text-[14px] text-text-secondary">
                No hay coincidencias en el CRM para “{query.trim()}”.
              </p>
              {aiHit ? (
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${aiHit.id}`}
                  aria-selected={flat.findIndex((row) => row.id === aiHit.id) === active}
                  data-active={
                    flat.findIndex((row) => row.id === aiHit.id) === active
                      ? "true"
                      : undefined
                  }
                  onMouseEnter={() =>
                    setActive(flat.findIndex((row) => row.id === aiHit.id))
                  }
                  onClick={() => go(aiHit)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-[16px] bg-nav-active px-3 py-3 text-left ring-1 ring-border-subtle/50 transition-colors hover:bg-nav-hover"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-action-primary text-action-primary-foreground">
                    <Sparkles className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">
                      Preguntar a la IA
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-text-secondary">
                      {aiHit.subtitle ||
                        `Buscar o explicar “${query.trim()}” con el asistente`}
                    </span>
                  </span>
                </button>
              ) : null}
            </div>
          ) : hasCrmResults || (!query.trim() && grouped.length > 0) ? (
            grouped.map((group) => (
              <section key={group.kind} className="mb-3">
                <h2 className="px-1.5 pb-2 pt-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-text-secondary">
                  {group.label}
                </h2>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {group.hits.map((hit) => {
                    const Icon = iconFor(hit);
                    const index = flat.findIndex((row) => row.id === hit.id);
                    const selected = index === active;
                    return (
                      <button
                        key={hit.id}
                        type="button"
                        role="option"
                        id={`${listId}-${hit.id}`}
                        aria-selected={selected}
                        data-active={selected ? "true" : undefined}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(hit)}
                        className={`flex min-h-14 w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left transition-colors duration-150 motion-reduce:transition-none ${
                          selected
                            ? "bg-nav-active ring-1 ring-border-subtle/50"
                            : "bg-[color-mix(in_srgb,var(--color-surface-elevated)_40%,transparent)] hover:bg-nav-hover"
                        }`}
                      >
                        <span
                          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                            hit.kind === "ai"
                              ? "bg-action-primary text-action-primary-foreground"
                              : "bg-[color-mix(in_srgb,var(--color-surface-elevated)_70%,transparent)] text-text-secondary-strong ring-1 ring-border-subtle/40"
                          }`}
                        >
                          <Icon className="size-[18px]" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-ink">
                            {hit.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-text-secondary">
                            {hit.subtitle}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          ) : searchingDb ? null : (
            <p className="px-3 py-8 text-sm text-text-secondary">
              Escribe al menos 2 caracteres para buscar en el CRM.
            </p>
          )}
        </div>

        <p className="border-t border-border-subtle/60 px-5 py-2.5 text-[11px] text-text-secondary">
          ↑↓←→ mover · ⏎ abrir · {isMac() ? "⌘" : "Ctrl"}⏎ preguntar a la IA
        </p>
      </dialog>
    </div>
  );
}
