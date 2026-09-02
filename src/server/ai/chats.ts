import type { Prisma } from "@prisma/client";
import type { UIMessage } from "ai";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";

function titleFromMessages(messages: UIMessage[]): string {
  const first = messages.find((message) => message.role === "user");
  const text = first?.parts
    ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Nuevo chat";
  return text.length > 80 ? `${text.slice(0, 77).trimEnd()}…` : text;
}

function asMessages(value: Prisma.JsonValue): UIMessage[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown as UIMessage[]).map((message, index) => ({
    ...message,
    id: message.id?.trim() ? message.id : `msg-${index}-${message.role ?? "unknown"}`,
  }));
}

export async function listChats(
  ctx: OrganizationContext,
  limit = 40,
): Promise<
  Array<{
    id: string;
    title: string;
    updatedAt: Date;
    createdAt: Date;
    preview: string;
  }>
> {
  const rows = await prisma.aiChat.findMany({
    where: { organizationId: ctx.organizationId, userId: ctx.userId },
    orderBy: { updatedAt: "desc" },
    take: Math.min(limit, 80),
    select: { id: true, title: true, updatedAt: true, createdAt: true, messages: true },
  });
  const emptyIds = rows
    .filter((row) => asMessages(row.messages).length === 0)
    .map((row) => row.id);
  if (emptyIds.length > 0) {
    await prisma.aiChat.deleteMany({
      where: {
        id: { in: emptyIds },
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    });
  }
  return rows
    .filter((row) => !emptyIds.includes(row.id))
    .map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
      preview: titleFromMessages(asMessages(row.messages)),
    }));
}

export async function getChat(ctx: OrganizationContext, chatId: string) {
  const chat = await prisma.aiChat.findFirst({
    where: {
      id: chatId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    },
  });
  if (!chat) {
    return {
      id: chatId,
      title: "Nuevo chat",
      messages: [] as UIMessage[],
      updatedAt: new Date(),
    };
  }
  return {
    id: chat.id,
    title: chat.title,
    messages: asMessages(chat.messages),
    updatedAt: chat.updatedAt,
  };
}

export async function createChat(ctx: OrganizationContext, id?: string) {
  return prisma.aiChat.create({
    data: {
      ...(id ? { id } : {}),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      title: "Nuevo chat",
      messages: [],
    },
    select: { id: true, title: true },
  });
}

export async function saveChatMessages(
  ctx: OrganizationContext,
  chatId: string,
  messages: UIMessage[],
) {
  const title = titleFromMessages(messages);
  const existing = await prisma.aiChat.findFirst({
    where: {
      id: chatId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    },
    select: { id: true },
  });
  const payload: Prisma.InputJsonValue = messages.map((message, index) => ({
    ...message,
    id: message.id?.trim() ? message.id : `msg-${index}-${message.role ?? "unknown"}`,
  })) as unknown as Prisma.InputJsonValue;
  if (!existing) {
    return prisma.aiChat.create({
      data: {
        id: chatId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        title,
        messages: payload,
      },
      select: { id: true },
    });
  }
  return prisma.aiChat.update({
    where: { id: existing.id },
    data: { title, messages: payload },
    select: { id: true },
  });
}

export async function deleteChat(ctx: OrganizationContext, chatId: string) {
  const existing = await prisma.aiChat.findFirst({
    where: {
      id: chatId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    },
    select: { id: true },
  });
  if (!existing) throw new DomainError("Chat no encontrado.");
  await prisma.aiChat.delete({ where: { id: existing.id } });
}
