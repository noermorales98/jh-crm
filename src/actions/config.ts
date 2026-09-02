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
import { moneySchema } from "@/src/lib/validation/common";
import { cuidSchema } from "@/src/lib/validation/common";
import * as configService from "@/src/server/config";

function revalidateConfig() {
  revalidatePath("/crm/configuracion");
  revalidatePath("/crm/configuracion/etapas");
  revalidatePath("/crm/dashboard");
}

const settingsSchema = z.object({
  legalName: z.string().trim().min(1).max(200).optional(),
  logoUrl: z.string().trim().url().nullish(),
  phone: z.string().trim().max(30).nullish(),
  email: z.string().trim().email("Correo inválido.").nullish(),
  website: z.string().trim().max(200).nullish(),
  addressLine1: z.string().trim().max(200).nullish(),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(100).nullish(),
  state: z.string().trim().max(50).nullish(),
  postalCode: z.string().trim().max(20).nullish(),
  country: z.string().trim().length(2).optional(),
  timezone: z.string().trim().max(60).optional(),
  currency: z.string().trim().length(3).optional(),
  defaultTaxRate: moneySchema.optional(),
  quotePrefix: z.string().trim().optional(),
  receiptPrefix: z.string().trim().optional(),
  clientPrefix: z.string().trim().optional(),
  casePrefix: z.string().trim().optional(),
  defaultTerms: z.string().trim().max(10000).nullish(),
  callmebotEnabled: z.boolean().optional(),
  whatsappRecipients: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40).nullish(),
        label: z.string().trim().max(80),
        phone: z.string().trim().max(20),
        apiKey: z.string().trim().max(80).optional(),
        enabled: z.boolean(),
      }),
    )
    .max(4)
    .optional(),
});

export async function updateSettings(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const data = settingsSchema.parse(input);
    const settings = await configService.updateSettings(ctx, data);
    revalidateConfig();
    return actionOk({ id: settings.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function sendTestWhatsapp(
  recipientId: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const id = cuidSchema.parse(recipientId);
    const result = await configService.sendTestWhatsapp(ctx, id);
    revalidatePath("/crm", "layout");
    revalidatePath("/crm/configuracion");
    return actionOk({ message: result.message });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const stageSchema = z.object({
  key: z.string().trim().min(1, "La clave es obligatoria.").max(40),
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(100),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Color hexadecimal inválido.").optional(),
  isTerminal: z.boolean().optional(),
});

export async function createStage(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const data = stageSchema.parse(input);
    const stage = await configService.createStage(ctx, data);
    revalidateConfig();
    return actionOk({ id: stage.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const stageUpdateSchema = stageSchema.partial();

export async function updateStage(
  stageId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const id = cuidSchema.parse(stageId);
    const data = stageUpdateSchema.parse(input);
    const stage = await configService.updateStage(ctx, id, data);
    revalidateConfig();
    return actionOk({ id: stage.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const reorderSchema = z.object({ orderedIds: z.array(cuidSchema).min(1) });

export async function reorderStages(input: unknown): Promise<ActionResult<{ count: number }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const { orderedIds } = reorderSchema.parse(input);
    const stages = await configService.reorderStages(ctx, orderedIds);
    revalidateConfig();
    return actionOk({ count: stages.length });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function deactivateStage(stageId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const id = cuidSchema.parse(stageId);
    const stage = await configService.deactivateStage(ctx, id);
    revalidateConfig();
    return actionOk({ id: stage.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
