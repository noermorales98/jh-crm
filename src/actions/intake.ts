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
import {
  createClientIntakeLink,
  revokeClientIntakeLink,
} from "@/src/server/intake/links";

const createSchema = z.object({
  clientId: cuidSchema,
  caseId: cuidSchema.nullish(),
  maxUses: z.number().int().min(1).max(10).optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

export async function createIntakeLink(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    url: string;
    token: string;
    maxUses: number;
    expiresAt: Date | null;
  }>
> {
  try {
    const ctx = await requirePermission("clients.edit");
    const data = createSchema.parse(input);
    const link = await createClientIntakeLink(ctx, data);
    revalidatePath(`/crm/clientes/${data.clientId}`);
    return actionOk(link);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function revokeIntakeLink(
  linkId: string,
  clientId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("clients.edit");
    const id = cuidSchema.parse(linkId);
    const client = cuidSchema.parse(clientId);
    const link = await revokeClientIntakeLink(ctx, id);
    revalidatePath(`/crm/clientes/${client}`);
    return actionOk({ id: link.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
