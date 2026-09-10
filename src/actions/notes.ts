"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { leadMessageCreateSchema } from "@/src/lib/validation/notes";
import * as notes from "@/src/server/notes";

export async function addLeadMessageAction(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string | null;
  }>
> {
  try {
    const ctx = await requirePermission("opportunities.manage");
    const data = leadMessageCreateSchema.parse(input);
    const note = await notes.createClientNote(ctx, {
      clientId: data.clientId,
      body: data.body,
      opportunityId: data.opportunityId,
    });

    revalidatePath("/crm/oportunidades", "layout");
    revalidatePath("/crm/oportunidades", "page");
    revalidatePath(`/crm/clientes/${data.clientId}`);
    revalidatePath(`/crm/clientes/${data.clientId}/actividad`);

    return actionOk({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      authorName: note.author.name,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
