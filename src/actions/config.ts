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
import { cuidSchema, emailSchema, moneySchema } from "@/src/lib/validation/common";
import * as configService from "@/src/server/config";
import {
  wipeOrganizationData,
  type WipeResult,
} from "@/src/server/config/wipe-org-data";

function revalidateConfig() {
  revalidatePath("/crm/configuracion");
  revalidatePath("/crm/configuracion/notificaciones");
  revalidatePath("/crm/configuracion/seguridad");
  revalidatePath("/crm/configuracion/etapas");
  revalidatePath("/crm/configuracion/datos");
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
  smtpHost: z.string().trim().max(200).nullish(),
  smtpPort: z.coerce.number().int().min(1).max(65535).nullish(),
  smtpUser: z.string().trim().max(200).nullish(),
  smtpPassword: z.string().max(200).optional(),
  smtpFrom: z.string().trim().max(200).nullish(),
  smtpSecure: z.boolean().optional(),
  smtpTestTo: emailSchema.optional().or(z.literal("")).nullish(),
  digestEnabled: z.boolean().optional(),
  digestHour: z.coerce.number().int().min(0).max(23).optional(),
  notifyEmailTask: z.boolean().optional(),
  notifyWhatsappTask: z.boolean().optional(),
  notifyEmailCase: z.boolean().optional(),
  notifyWhatsappCase: z.boolean().optional(),
  notifyEmailPayment: z.boolean().optional(),
  notifyWhatsappPayment: z.boolean().optional(),
  notifyEmailDigest: z.boolean().optional(),
  notifyWhatsappDigest: z.boolean().optional(),
  notifyEmailMail: z.boolean().optional(),
  notifyWhatsappMail: z.boolean().optional(),
  notifyEmailContact: z.boolean().optional(),
  notifyWhatsappContact: z.boolean().optional(),
  notifyEmailIntake: z.boolean().optional(),
  notifyWhatsappIntake: z.boolean().optional(),
  emailClientPaymentDue: z.boolean().optional(),
  emailClientDocsPending: z.boolean().optional(),
  emailClientQuoteSent: z.boolean().optional(),
  emailClientQuoteExpiring: z.boolean().optional(),
  emailClientCaseReview: z.boolean().optional(),
  emailClientRoundReview: z.boolean().optional(),
  whapiEnabled: z.boolean().optional(),
  whapiToken: z.string().max(500).optional(),
  whapiBaseUrl: z.string().trim().max(200).nullish(),
  whatsappClientPaymentDue: z.boolean().optional(),
  whatsappClientDocsPending: z.boolean().optional(),
  whatsappClientQuoteSent: z.boolean().optional(),
  whatsappClientQuoteExpiring: z.boolean().optional(),
  whatsappClientCaseReview: z.boolean().optional(),
  whatsappClientRoundReview: z.boolean().optional(),
  stripeEnabled: z.boolean().optional(),
  stripeSecretKey: z.string().max(200).optional(),
  stripeWebhookSecret: z.string().max(200).optional(),
  stripePublishableKey: z.string().trim().max(200).nullish(),
  documentSoftDeleteRetentionDays: z
    .union([z.coerce.number().int().min(1).max(3650), z.null()])
    .optional(),
  documentMaxRetentionDays: z
    .union([z.coerce.number().int().min(1).max(3650), z.null()])
    .optional(),
  emailRecipients: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40).nullish(),
        label: z.string().trim().max(80),
        email: z.string().trim().email("Correo inválido.").or(z.literal("")),
        enabled: z.boolean(),
      }),
    )
    .max(10)
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

export async function sendTestEmail(
  to: unknown,
): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const recipient = emailSchema.parse(to);
    const result = await configService.sendTestEmail(ctx, recipient);
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function sendTestWhapiClient(
  to: unknown,
): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const phone = z.string().trim().min(8).max(20).parse(to);
    const result = await configService.sendTestWhapiClient(ctx, phone);
    revalidatePath("/crm/configuracion");
    return actionOk(result);
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

/** OWNER/ADMIN: borra clientes, leads y el resto de datos operativos. */
export async function wipeOrganizationDataAction(
  confirmation: unknown,
): Promise<ActionResult<WipeResult>> {
  try {
    const ctx = await requireRole("OWNER", "ADMIN");
    const phrase = z.string().parse(confirmation);
    const result = await wipeOrganizationData(ctx, phrase);
    revalidatePath("/crm", "layout");
    revalidateConfig();
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
