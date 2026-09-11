"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Loader2, Send, Square } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { play } from "cuelume";
import { takeAskAiSeed } from "@/src/components/ai/ask-ai";
import { AssistantMessage } from "@/src/components/ai/markdown-text";
import { ChatBlobatar } from "@/src/components/ai/chat-blobatar";
import { chatBlobatarName } from "@/src/lib/ai/blobatar-name";

const SUGGESTIONS = [
  "Lista de mis clientes",
  "¿Qué pagos hay pendientes?",
  "¿Qué requiere atención en crédito?",
  "Progreso crediticio de un cliente",
  "¿Cómo agrego un cliente?",
];

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function isToolPart(part: UIMessage["parts"][number]): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

function messageHasTools(message: UIMessage): boolean {
  return message.parts.some(isToolPart);
}

function toolsPending(message: UIMessage): boolean {
  return message.parts.some((part) => {
    if (!isToolPart(part)) return false;
    const state = "state" in part && typeof part.state === "string" ? part.state : "";
    return state !== "output-available" && state !== "output-error";
  });
}

function waitingLabel(message: UIMessage | undefined, hasText: boolean): string {
  if (message && toolsPending(message)) return "Consultando el CRM…";
  if (hasText) return "Escribiendo…";
  return "Pensando…";
}

function WaitingStatus({ label }: { label: string }) {
  return (
    <p
      className="flex items-center gap-2 text-sm text-text-secondary"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 shrink-0 animate-spin text-action-primary" aria-hidden />
      <span>{label}</span>
    </p>
  );
}

function AssistantWaitingBubble({
  compact,
  chatId,
  label,
}: {
  compact: boolean;
  chatId?: string;
  label: string;
}) {
  return (
    <div className="flex items-end justify-start gap-2">
      <ChatBlobatar
        name={chatId ? chatBlobatarName(chatId) : "jh-asistente"}
        size={compact ? 28 : 32}
        className="mb-0.5 shrink-0"
        title="Asistente"
      />
      <div className="max-w-[min(40rem,90%)] rounded-[18px] bg-surface-panel px-3.5 py-2 text-ink ring-1 ring-border-subtle/40">
        <WaitingStatus label={label} />
      </div>
    </div>
  );
}

export function AiChatPanel({
  chatId,
  initialMessages = [],
  variant = "page",
}: {
  chatId?: string;
  initialMessages?: UIMessage[];
  variant?: "page" | "widget";
}) {
  const [input, setInput] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [dockPad, setDockPad] = useState(96);
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/chat" }),
    [],
  );
  const { messages, sendMessage, status, error, stop, clearError } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
  });

  const busy = status === "submitted" || status === "streaming";
  const compact = variant === "widget";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/chat")
      .then((res) => res.json())
      .then((data: { configured?: boolean }) => {
        if (!cancelled) setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || compact) return;
    el.style.height = "0px";
    const max = Math.round(window.innerHeight * 0.45);
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [compact, input]);

  useLayoutEffect(() => {
    if (compact) return;
    const node = formRef.current;
    if (!node) return;
    const update = () => setDockPad(node.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [compact]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    if (error) play("error");
  }, [error]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || configured === false) return;
    setInput("");
    clearError();
    play("loading");
    await sendMessage({ text });
  }

  async function ask(text: string) {
    if (busy || configured === false) return;
    clearError();
    play("loading");
    await sendMessage({ text });
  }

  useEffect(() => {
    if (!chatId || variant !== "page" || busy || configured !== true) return;
    const prompt = takeAskAiSeed(chatId);
    if (!prompt) return;
    void ask(prompt);
  }, [chatId, variant, busy, configured]);

  const lastMessage = messages.at(-1);
  const showLeadingWait = busy && (!lastMessage || lastMessage.role === "user");

  const thread = (
    <>
      {configured === false ? (
        <p className="text-sm text-text-secondary">
          Falta configurar <span className="font-medium text-ink">OPENROUTER_API_KEY</span>{" "}
          para activar el asistente.
        </p>
      ) : null}

      {messages.length === 0 && configured !== false ? (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Pregunta sobre el CRM, un cliente o cómo hacer algo. Te llevo a la pantalla.
          </p>
          <div className={`flex ${compact ? "flex-col" : "flex-wrap"} gap-2`}>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                disabled={busy}
                data-cuelume-press="press"
                data-cuelume-release="release"
                className="rounded-full bg-surface-elevated px-3.5 py-2 text-left text-sm text-ink ring-1 ring-border-subtle/50 transition-colors hover:bg-nav-hover disabled:opacity-60"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {messages.map((message, index) => {
        const text = messageText(message);
        const isLast = index === messages.length - 1;
        const pendingAssistant =
          message.role === "assistant" &&
          !text &&
          (messageHasTools(message) || (busy && isLast));
        if (message.role !== "user" && message.role !== "assistant") return null;
        if (!text && !pendingAssistant) return null;
        const mine = message.role === "user";
        const face = chatId ? chatBlobatarName(chatId) : "jh-asistente";
        const stillWorking = busy && isLast && !mine;
        return (
          <div
            key={message.id || `${message.role}-${index}`}
            className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}
          >
            {!mine ? (
              <ChatBlobatar
                name={face}
                size={compact ? 28 : 32}
                className="mb-0.5 shrink-0"
                title="Asistente"
              />
            ) : null}
            <div
              className={`max-w-[min(40rem,90%)] rounded-[18px] px-3.5 py-2 ${
                mine
                  ? "bg-action-primary text-action-primary-foreground"
                  : "bg-surface-panel text-ink ring-1 ring-border-subtle/40"
              }`}
            >
              {pendingAssistant ? (
                <WaitingStatus label={waitingLabel(message, false)} />
              ) : mine ? (
                <p className="whitespace-pre-wrap text-sm leading-5">{text}</p>
              ) : (
                <>
                  <AssistantMessage text={text} />
                  {stillWorking ? (
                    <div className="mt-2">
                      <WaitingStatus label={waitingLabel(message, true)} />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        );
      })}

      {showLeadingWait ? (
        <AssistantWaitingBubble
          compact={compact}
          chatId={chatId}
          label={waitingLabel(lastMessage, false)}
        />
      ) : null}

      {error ? (
        <p className="text-sm text-danger-ink">
          {error.message || "No pude responder. Intenta de nuevo."}
        </p>
      ) : null}
    </>
  );

  const composer = (
    <div className="flex items-end gap-2">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        rows={1}
        placeholder="Pregunta al CRM…"
        disabled={configured === false}
        className={
          compact
            ? "min-h-11 max-h-28 flex-1 resize-none rounded-control border border-border-subtle bg-surface-elevated px-3 py-2.5 text-sm text-ink placeholder:text-text-placeholder focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/15 disabled:bg-surface-panel"
            : "jh-chat-input jh-overlay-shadow max-h-[45vh] min-h-11 flex-1 resize-none overflow-y-auto rounded-full border border-border-subtle bg-surface-elevated px-5 py-2.5 text-sm leading-5 text-ink placeholder:text-text-placeholder disabled:bg-surface-panel"
        }
      />
      {busy ? (
        <button
          type="button"
          onClick={() => stop()}
          data-cuelume-press="press"
          data-cuelume-release="release"
          className={
            compact
              ? "flex size-11 shrink-0 items-center justify-center rounded-control bg-surface-panel text-ink hover:bg-nav-active"
              : "flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-panel text-ink hover:bg-nav-active"
          }
          aria-label="Detener"
        >
          <Square className="size-4" aria-hidden />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!input.trim() || configured === false}
          data-cuelume-press="press"
          data-cuelume-release="release"
          className={
            compact
              ? "flex size-11 shrink-0 items-center justify-center rounded-control bg-action-primary text-action-primary-foreground hover:bg-action-secondary disabled:opacity-60"
              : "flex size-11 shrink-0 items-center justify-center rounded-full bg-action-primary text-action-primary-foreground hover:bg-action-secondary disabled:opacity-60"
          }
          aria-label="Enviar"
        >
          <Send className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );

  return (
    <div className={`relative flex min-h-0 flex-col ${compact ? "flex-1" : "h-full"}`}>
      <div
        ref={listRef}
        className={
          compact
            ? "min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-2"
            : "min-h-0 flex-1 overflow-y-auto"
        }
      >
        {compact ? (
          thread
        ) : (
          <div
            className="mx-auto max-w-3xl space-y-3 px-6 pt-4"
            style={{ paddingBottom: dockPad }}
          >
            {thread}
          </div>
        )}
      </div>

      {compact ? (
        <form onSubmit={onSubmit} className="mt-3 border-t border-border-subtle pt-3">
          {composer}
          <p className="mt-2 text-xs text-text-secondary">
            Historial en{" "}
            <Link href="/crm/chats" className="font-medium text-action-primary">
              Chats
            </Link>
          </p>
        </form>
      ) : (
        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="pointer-events-none absolute inset-x-0 bottom-0 pt-16"
        >
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-app via-surface-app/80 to-transparent"
            aria-hidden
          />
          <div className="pointer-events-auto relative mx-auto max-w-3xl px-6 pb-4">
            {composer}
          </div>
        </form>
      )}
    </div>
  );
}
