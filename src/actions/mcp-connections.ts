"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganization } from "@/src/server/auth/guards";
import { actionFail, actionOk, isNextControlError, type ActionResult } from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import { revokeConnection, setMcpEnabled } from "@/src/server/mcp/connections";

/** Configuración → Claude: revocar una conexión y encender/apagar el conector. */

const PAGE = "/crm/configuracion/claude";

export async function revokeMcpConnectionAction(connectionId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireOrganization();
    const id = cuidSchema.parse(connectionId);
    await revokeConnection(ctx, id);
    revalidatePath(PAGE);
    return actionOk({ id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function setMcpEnabledAction(enabled: unknown): Promise<ActionResult<{ enabled: boolean }>> {
  try {
    const ctx = await requireOrganization();
    const value = z.boolean().parse(enabled);
    await setMcpEnabled(ctx, value);
    revalidatePath(PAGE);
    return actionOk({ enabled: value });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
