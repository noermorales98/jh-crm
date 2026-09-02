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
import {
  clientCreateSchema,
  clientUpdateSchema,
  sensitiveProfileSchema,
} from "@/src/lib/validation";
import { cuidSchema } from "@/src/lib/validation/common";
import * as clientService from "@/src/server/clients";

function revalidateClients(clientId?: string) {
  revalidatePath("/crm/clientes");
  revalidatePath("/crm/dashboard");
  if (clientId) {
    revalidatePath(`/crm/clientes/${clientId}`);
    revalidatePath(`/crm/clientes/${clientId}/expediente`);
  }
}

export async function createClient(
  input: unknown,
): Promise<ActionResult<{ id: string; clientCode: string }>> {
  try {
    const ctx = await requirePermission("clients.create");
    const data = clientCreateSchema.parse(input);
    const client = await clientService.createClient(ctx, data);
    revalidateClients(client.id);
    return actionOk({ id: client.id, clientCode: client.clientCode });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateClient(
  clientId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("clients.edit");
    const id = cuidSchema.parse(clientId);
    const data = clientUpdateSchema.parse(input);
    const client = await clientService.updateClient(ctx, id, data);
    revalidateClients(client.id);
    return actionOk({ id: client.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function archiveClient(
  clientId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("clients.edit");
    const id = cuidSchema.parse(clientId);
    const client = await clientService.archiveClient(ctx, id);
    revalidateClients(client.id);
    return actionOk({ id: client.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const assignSchema = z.object({ assignedToId: cuidSchema.nullable() });

export async function assignClient(
  clientId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("clients.edit");
    const id = cuidSchema.parse(clientId);
    const { assignedToId } = assignSchema.parse(input);
    const client = await clientService.assignClient(ctx, id, assignedToId);
    revalidateClients(client.id);
    return actionOk({ id: client.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateSensitiveProfile(
  clientId: string,
  input: unknown,
): Promise<ActionResult<{ ssnMasked: string | null }>> {
  try {
    const ctx = await requirePermission("sensitive.edit");
    const id = cuidSchema.parse(clientId);
    const data = sensitiveProfileSchema.parse(input);
    const result = await clientService.updateSensitiveProfile(ctx, id, {
      ssn: data.ssn || null,
      dateOfBirth: data.dateOfBirth ?? null,
      driversLicenseNumber: data.driversLicenseNumber || null,
      sensitiveNotes: data.sensitiveNotes || null,
    });
    revalidateClients(id);
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
