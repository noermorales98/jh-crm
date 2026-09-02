"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/src/server/auth/guards";
import {
  actionFail,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import * as chatService from "@/src/server/ai/chats";

export async function createAiChat(): Promise<void> {
  await requireOrganization();
  redirect(`/crm/chats/${crypto.randomUUID()}`);
}

export async function deleteAiChat(chatId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrganization();
    const id = cuidSchema.parse(chatId);
    await chatService.deleteChat(ctx, id);
    revalidatePath("/crm/chats");
    return { ok: true, data: { id } };
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
