"use client";

import { MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AiChatPanel } from "@/src/components/ai/ai-chat-panel";
import { ChatBlobatar } from "@/src/components/ai/chat-blobatar";

export function CrmChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hidden = pathname.startsWith("/crm/chats");

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hidden) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open ? (
        <section
          className="pointer-events-auto flex h-[min(44rem,calc(100dvh-7rem))] w-[min(32rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-surface bg-surface-elevated jh-overlay-shadow"
          aria-label="Asistente del CRM"
        >
          <header className="flex items-center justify-between bg-surface-panel px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <ChatBlobatar name="jh-asistente" size={28} className="shrink-0" title="Asistente J&H" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Asistente J&H</p>
                <p className="text-xs text-text-secondary">
                  <Link href="/crm/chats" className="hover:text-ink">
                    Ver chats
                  </Link>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-8 items-center justify-center rounded-full text-text-secondary-strong transition-colors hover:bg-nav-hover hover:text-ink"
              aria-label="Cerrar chat"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-2">
            <AiChatPanel variant="widget" />
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        data-cuelume-press="press"
        data-cuelume-release="release"
        className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-action-primary text-action-primary-foreground jh-overlay-shadow transition-colors hover:bg-action-secondary"
        aria-expanded={open}
        aria-label={open ? "Cerrar asistente" : "Abrir asistente del CRM"}
      >
        {open ? <X className="size-5" aria-hidden /> : <MessageCircle className="size-5" aria-hidden />}
      </button>
    </div>
  );
}
