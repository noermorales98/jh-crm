import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Plus } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { listChats } from "@/src/server/ai/chats";
import { createAiChat } from "@/src/actions/ai-chats";
import { Button, EmptyState, PageHeader } from "@/src/components/ui";
import { formatRelative } from "@/src/lib/format";
import { ChatBlobatar } from "@/src/components/ai/chat-blobatar";
import { chatBlobatarName } from "@/src/lib/ai/blobatar-name";
import { DeleteChatButton } from "@/src/components/ai/delete-chat-button";

export const metadata: Metadata = {
  title: "Chats",
};

export default async function ChatsPage() {
  const ctx = await requireOrganization();
  const chats = await listChats(ctx);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Chats"
        description="Conversaciones con el asistente."
        actions={
          <form action={createAiChat}>
            <Button type="submit">
              <Plus className="size-4" aria-hidden />
              Nuevo
            </Button>
          </form>
        }
      />

      {chats.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="Sin conversaciones"
          description="Empieza un chat nuevo para preguntar sobre el CRM."
          action={
            <form action={createAiChat}>
              <Button type="submit">Nuevo chat</Button>
            </form>
          }
        />
      ) : (
        <ul className="divide-y divide-border-subtle rounded-surface bg-surface-elevated">
          {chats.map((chat) => (
            <li key={chat.id} className="flex items-center gap-2 px-2">
              <Link
                href={`/crm/chats/${chat.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-control px-3 py-3 transition-colors hover:bg-nav-hover"
              >
                <ChatBlobatar
                  name={chatBlobatarName(chat.id)}
                  size={36}
                  className="shrink-0"
                  title={chat.title}
                />
                <span className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{chat.title}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {formatRelative(chat.updatedAt)}
                  </p>
                </span>
              </Link>
              <DeleteChatButton chatId={chat.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
