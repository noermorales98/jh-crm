"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import * as notifications from "@/src/server/notifications";

function revalidateInbox() {
  revalidatePath("/crm", "layout");
}

export async function markNotificationRead(
  notificationId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrganization();
    const id = cuidSchema.parse(notificationId);
    const updated = await notifications.markNotificationRead(
      ctx.organizationId,
      ctx.userId,
      id,
    );
    if (!updated) {
      return { ok: false, error: "Notificación no encontrada." };
    }
    revalidateInbox();
    return actionOk({ id: updated.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function markAllNotificationsRead(): Promise<
  ActionResult<{ count: number }>
> {
  try {
    const ctx = await requireOrganization();
    const result = await notifications.markAllNotificationsRead(
      ctx.organizationId,
      ctx.userId,
    );
    revalidateInbox();
    return actionOk({ count: result.count });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
