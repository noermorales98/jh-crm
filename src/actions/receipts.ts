"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import * as receiptService from "@/src/server/receipts";

const voidSchema = z.object({
  voidReason: z.string().trim().min(3, "Indica el motivo de la anulación.").max(1000),
});

/** Anulación de recibo: solo OWNER/ADMIN. Nunca borra el registro. */
export async function voidReceipt(
  receiptId: string,
  input: unknown,
): Promise<ActionResult<{ id: string; folio: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const id = cuidSchema.parse(receiptId);
    const { voidReason } = voidSchema.parse(input);
    const receipt = await receiptService.voidReceipt(ctx, id, voidReason);
    revalidatePath("/crm/recibos");
    revalidatePath("/crm/pagos");
    return actionOk({ id: receipt.id, folio: receipt.folio });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
