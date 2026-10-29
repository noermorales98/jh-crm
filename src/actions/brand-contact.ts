"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import { actionFail, actionOk, isNextControlError, type ActionResult } from "@/src/server/errors";
import { updateBrandContact, type BrandContact } from "@/src/server/config/brand-contact";
import { SIGNATURE_MAX_CHARS } from "@/src/lib/brand/contact-links";

/** Guarda el contacto del negocio y la firma del representante (Configuración). */
export async function updateBrandContactAction(input: unknown): Promise<ActionResult<BrandContact>> {
  try {
    const ctx = await requirePermission("settings.manage");
    const data = z
      .object({
        whatsappNumber: z.string().max(30).nullable().optional(),
        bookingUrl: z.string().max(300).nullable().optional(),
        representativeName: z.string().max(120).nullable().optional(),
        representativeSignature: z.string().max(SIGNATURE_MAX_CHARS).nullable().optional(),
      })
      .parse(input);
    const saved = await updateBrandContact(ctx, data);
    revalidatePath("/crm/configuracion");
    return actionOk(saved);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
