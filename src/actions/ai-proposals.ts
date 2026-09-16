"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import { createTask } from "@/src/server/tasks";
import { writeActivityLog } from "@/src/server/activity";
import { toActivityContext } from "@/src/server/context";
import { DomainError } from "@/src/server/errors";

const applySchema = z.object({
  kind: z.enum(["task", "activity", "status_note"]),
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().max(5000).optional().nullable(),
  clientId: cuidSchema,
  caseId: cuidSchema.optional().nullable(),
});

export async function applyAiProposalAction(
  input: unknown,
): Promise<ActionResult<{ id: string; kind: string }>> {
  try {
    const ctx = await requirePermission("tasks.manage");
    const data = applySchema.parse(input);
    if (!data.clientId) {
      throw new DomainError("Indica el cliente (abre el caso o pásalo en la herramienta).");
    }

    if (data.kind === "task") {
      const task = await createTask(ctx, {
        title: data.title,
        description: data.details ?? null,
        type: "FOLLOW_UP",
        clientId: data.clientId,
        caseId: data.caseId ?? null,
        assignedToId: ctx.userId,
      });
      revalidatePath("/crm/tareas");
      revalidatePath(`/crm/clientes/${data.clientId}`);
      if (data.caseId) revalidatePath(`/crm/casos/${data.caseId}`);
      return actionOk({ id: task.id, kind: "task" });
    }

    const activity = await writeActivityLog(toActivityContext(ctx), {
      type: "NOTE",
      description: data.details?.trim()
        ? `${data.title}: ${data.details.trim()}`
        : data.title,
      clientId: data.clientId,
      caseId: data.caseId ?? null,
      metadata: { source: "ai_proposal", kind: data.kind },
    });
    revalidatePath(`/crm/clientes/${data.clientId}`);
    if (data.caseId) revalidatePath(`/crm/casos/${data.caseId}`);
    return actionOk({ id: activity.id, kind: data.kind });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
