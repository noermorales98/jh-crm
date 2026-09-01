import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { getChat } from "@/src/server/ai/chats";
import { DomainError } from "@/src/server/errors";
import { AiChatPanel } from "@/src/components/ai/ai-chat-panel";
import { HeaderTitle } from "../../CrmHeader";

export const metadata: Metadata = {
  title: "Chat",
};

export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const ctx = await requireOrganization();
  const { chatId } = await params;
  let chat;
  try {
    chat = await getChat(ctx, chatId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <HeaderTitle title={chat.title} />
      <h1 className="sr-only">{chat.title}</h1>
      <AiChatPanel chatId={chat.id} initialMessages={chat.messages} variant="page" />
    </div>
  );
}
