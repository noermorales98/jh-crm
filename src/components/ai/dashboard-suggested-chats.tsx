"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { play } from "cuelume";
import { startAskAiChat } from "@/src/components/ai/ask-ai";
import { ChatBlobatar } from "@/src/components/ai/chat-blobatar";
import { chatBlobatarName } from "@/src/lib/ai/blobatar-name";
import { Button } from "@/src/components/ui";
import { createAiChat } from "@/src/actions/ai-chats";
import type { SuggestedChat } from "@/src/lib/ai/suggested-chats";

/**
 * Lista de chats sugeridos (dinámicos) con blobatars distintos.
 * Al hacer clic abre un chat nuevo con el prompt precargado.
 */
export function DashboardSuggestedChats({
  suggestions,
}: {
  suggestions: SuggestedChat[];
}) {
  const router = useRouter();

  function openSuggestion(prompt: string) {
    const href = startAskAiChat(prompt);
    if (!href) return;
    play("tick");
    router.push(href);
  }

  return (
    <section aria-labelledby="chats-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h2
            id="chats-heading"
            className="text-[13px] font-semibold text-text-secondary-strong"
          >
            Chats sugeridos
          </h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Ideas según lo pendiente hoy · cambian con tus datos
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/crm/chats"
            className="min-h-11 inline-flex items-center text-[13px] font-medium text-action-primary hover:text-action-secondary"
          >
            Ver todos
          </Link>
          <form action={createAiChat}>
            <Button type="submit" size="sm" variant="secondary">
              <Plus className="size-4" aria-hidden />
              Nuevo
            </Button>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-[14px] bg-surface-elevated ring-1 ring-border-subtle/50">
        <ul role="list">
          {suggestions.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => openSuggestion(item.prompt)}
                className={`group flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-nav-hover motion-reduce:transition-none sm:px-5 ${
                  index > 0 ? "border-t border-border-subtle/60" : ""
                }`}
              >
                <ChatBlobatar
                  name={chatBlobatarName(item.id)}
                  size={36}
                  className="shrink-0"
                  title={item.title}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-text-secondary">
                    {item.subtitle}
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-text-secondary transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
