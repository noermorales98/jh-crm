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
  FileText,
  Home,
  Mail,
  MessageCircle,
  Package,
  Receipt,
  RefreshCcw,
  Search,
  Settings,
  Sparkles,
  UserCog,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { play } from "cuelume";
import { startAskAiChat } from "@/src/components/ai/ask-ai";
import {
  aiPromptFromQuery,
  buildAiHit,
  groupSpotlightHits,
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
  case: Briefcase,
  round: RefreshCcw,
  task: ClipboardList,
  service: Package,
  package: Package,
  quote: FileText,
  payment: CreditCard,
  receipt: Receipt,
  mail: Mail,
  user: UserCog,
};

function iconFor(hit: SpotlightHit): LucideIcon {
  if (hit.kind !== "page" && hit.kind !== "setting") return KIND_ICON[hit.kind];
  const href = hit.href ?? "";
  if (href.includes("/clientes")) return Users;
  if (href.includes("/casos")) return Briefcase;
  if (href.includes("/rondas")) return RefreshCcw;
  if (href.includes("/tareas")) return ClipboardList;
  if (href.includes("/servicios")) return Package;
  if (href.includes("/cotizaciones")) return FileText;
  if (href.includes("/pagos")) return CreditCard;
  if (href.includes("/recibos")) return Receipt;
  if (href.includes("/mails")) return Mail;
  if (href.includes("/chats")) return MessageCircle;
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
  const shortcut = isMac() ? "⌘K" : "Ctrl K";

  const localHits = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const pages = matchCatalog("", role).slice(0, 8);
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
      setRemote([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await res.json()) as { ok?: boolean; hits?: SpotlightHit[]; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "No se pudo buscar.");
        }
        setRemote(data.hits ?? []);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "No se pudo buscar.");
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    setActive(0);
  }, [query, remote]);

  useEffect(() => {
    const node = listRef.current?.querySelector("[data-active='true']");
    node?.scrollIntoView({ block: "nearest" });
  }, [active, flat]);

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

  function onOverlayKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
    } else if (event.key === "ArrowUp") {
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
        className="jh-spotlight-field flex h-9 w-full max-w-md items-center gap-2 rounded-full bg-surface-panel px-3 text-left text-sm text-text-secondary transition-colors hover:bg-nav-hover focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 lg:h-10 lg:px-4 motion-reduce:transition-none"
      >
        <Search className="size-4 shrink-0 text-text-secondary-strong" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Buscar o preguntar…</span>
        <kbd className="hidden rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-text-secondary-strong sm:inline">
          {shortcut}
        </kbd>
      </button>

      <dialog
        ref={dialogRef}
        className="jh-spotlight jh-material w-[min(36rem,calc(100vw-1.5rem))] overflow-hidden rounded-[22px] p-0 text-ink jh-overlay-shadow"
        aria-label="Búsqueda universal"
        onClose={() => {
          setQuery("");
          setRemote([]);
          setError(null);
          setActive(0);
          setOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="border-b border-border-subtle px-3 py-2.5">
          <div className="flex items-center gap-2 rounded-full bg-surface-app/80 px-3">
            <Search className="size-4 shrink-0 text-text-secondary-strong" aria-hidden />
            <input
              ref={overlayInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onOverlayKey}
              placeholder="Clientes, rondas, cuotas, páginas o una pregunta…"
              aria-label="Buscar en el CRM"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-expanded={open}
              aria-activedescendant={activeHit ? `${listId}-${activeHit.id}` : undefined}
              autoComplete="off"
              spellCheck={false}
              className="jh-spotlight-field h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-text-placeholder focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
            />
            {query ? (
              <button
                type="button"
                className="jh-spotlight-field flex size-7 items-center justify-center rounded-full text-text-secondary hover:bg-nav-hover hover:text-ink focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  setQuery("");
                  overlayInputRef.current?.focus();
                }}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
            {loading ? (
              <span className="text-[11px] text-text-secondary">Buscando…</span>
            ) : (
              <kbd className="hidden text-[11px] text-text-secondary sm:inline">esc</kbd>
            )}
          </div>
        </div>

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Resultados"
          className="max-h-[min(28rem,62vh)] overflow-y-auto px-2 py-2"
        >
          {error ? (
            <p className="px-3 py-4 text-sm text-danger-ink">{error}</p>
          ) : null}

          {grouped.length === 0 ? (
            <p className="px-3 py-6 text-sm text-text-secondary">
              No hay coincidencias. Pulsa ⌘⏎ para preguntar a la IA.
            </p>
          ) : (
            grouped.map((group) => (
              <section key={group.kind} className="mb-1">
                <h2 className="px-3 pb-1 pt-1.5 text-[12px] font-semibold text-text-secondary">
                  {group.label}
                </h2>
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
                      className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none ${
                        selected ? "bg-nav-active" : "hover:bg-nav-hover"
                      }`}
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                          hit.kind === "ai"
                            ? "bg-action-primary text-action-primary-foreground"
                            : "bg-surface-panel text-text-secondary-strong"
                        }`}
                      >
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {hit.title}
                        </span>
                        <span className="block truncate text-[13px] text-text-secondary">
                          {hit.subtitle}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </section>
            ))
          )}
        </div>

        <p className="border-t border-border-subtle px-4 py-2 text-[11px] text-text-secondary">
          ↑↓ mover · ⏎ abrir · {isMac() ? "⌘" : "Ctrl"}⏎ preguntar a la IA
        </p>
      </dialog>
    </div>
  );
}
