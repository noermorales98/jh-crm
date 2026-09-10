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
import { cuidSchema, moneySchema } from "@/src/lib/validation/common";
import * as catalog from "@/src/server/services";
import { SERVICE_CODES } from "@/src/server/services/codes";

function revalidateCatalog() {
  revalidatePath("/crm/servicios");
  revalidatePath("/crm/servicios/paquetes");
  revalidatePath("/crm/cotizaciones/nueva");
}

const serviceCodeSchema = z.enum(SERVICE_CODES);

const serviceSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(150),
  description: z.string().trim().max(2000).nullish(),
  defaultPrice: moneySchema,
  currency: z.string().trim().length(3).optional(),
  code: serviceCodeSchema.nullish(),
});

export async function createService(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("catalog.manage");
    const data = serviceSchema.parse(input);
    const service = await catalog.createService(ctx, data);
    revalidateCatalog();
    return actionOk({ id: service.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const serviceUpdateSchema = serviceSchema.partial();

export async function updateService(
  serviceId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("catalog.manage");
    const id = cuidSchema.parse(serviceId);
    const data = serviceUpdateSchema.parse(input);
    const service = await catalog.updateService(ctx, id, data);
    revalidateCatalog();
    return actionOk({ id: service.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function archiveService(serviceId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("catalog.manage");
    const id = cuidSchema.parse(serviceId);
    const service = await catalog.archiveService(ctx, id);
    revalidateCatalog();
    return actionOk({ id: service.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const packageSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(150),
  description: z.string().trim().max(2000).nullish(),
  defaultPrice: moneySchema,
  currency: z.string().trim().length(3).optional(),
  items: z
    .array(
      z.object({
        serviceId: cuidSchema,
        quantity: z.number().int().min(1, "Cantidad mínima 1."),
      }),
    )
    .min(1, "El paquete necesita al menos un servicio."),
});

export async function createPackage(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("catalog.manage");
    const data = packageSchema.parse(input);
    const pkg = await catalog.createPackage(ctx, data);
    revalidateCatalog();
    return actionOk({ id: pkg.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const packageUpdateSchema = packageSchema.partial();

export async function updatePackage(
  packageId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("catalog.manage");
    const id = cuidSchema.parse(packageId);
    const data = packageUpdateSchema.parse(input);
    const pkg = await catalog.updatePackage(ctx, id, data);
    revalidateCatalog();
    return actionOk({ id: pkg.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function archivePackage(packageId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("catalog.manage");
    const id = cuidSchema.parse(packageId);
    const pkg = await catalog.archivePackage(ctx, id);
    revalidateCatalog();
    return actionOk({ id: pkg.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
