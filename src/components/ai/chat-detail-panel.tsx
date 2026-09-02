import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { getChat } from "@/src/server/ai/chats";
import { DomainError } from "@/src/server/errors";
import { AiChatPanel } from "@/src/components/ai/ai-chat-panel";
import { chatBlobatarName } from "@/src/lib/ai/blobatar-name";
import { HeaderTitle } from "@/app/crm/CrmHeader";

export async function ChatDetailPanel({ chatId }: { chatId: string }) {
  const ctx = await requireOrganization();
  let chat;
  try {
    chat = await getChat(ctx, chatId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <HeaderTitle title={chat.title} blobatarName={chatBlobatarName(chat.id)} />
      <h2 className="sr-only">{chat.title}</h2>
      <AiChatPanel chatId={chat.id} initialMessages={chat.messages} variant="page" />
    </div>
  );
}
