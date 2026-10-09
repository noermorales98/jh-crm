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
import {
  assertImportFileMeta,
  type ClassifiedImportRow,
} from "@/src/server/clients/import-csv";
import {
  commitClientImport as commitClientImportService,
  previewClientImport as previewClientImportService,
} from "@/src/server/clients/import-preview";
import {
  destinationDisplayName,
  mergeClients as mergeClientsService,
} from "@/src/server/clients/merge";

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

export type ClientImportPreviewActionResult = {
  rows: ClassifiedImportRow[];
  counts: {
    create: number;
    exists: number;
    no_email: number;
    invalid: number;
    duplicate_in_file: number;
  };
};

/** Dry-run: no escribe. */
export async function previewClientImport(
  csvText: string,
  fileMeta?: { fileName?: string; mimeType?: string | null },
): Promise<ActionResult<ClientImportPreviewActionResult>> {
  try {
    const ctx = await requirePermission("clients.create");
    if (fileMeta?.fileName) {
      assertImportFileMeta(fileMeta.fileName, fileMeta.mimeType);
    }
    const result = await previewClientImportService(ctx, csvText);
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** Commit tras preview: solo crea filas `create`. */
export async function commitClientImport(
  csvText: string,
  fileMeta?: { fileName?: string; mimeType?: string | null },
): Promise<
  ActionResult<{
    created: number;
    errors: Array<{ row: number; message: string }>;
    counts: ClientImportPreviewActionResult["counts"];
  }>
> {
  try {
    const ctx = await requirePermission("clients.create");
    if (fileMeta?.fileName) {
      assertImportFileMeta(fileMeta.fileName, fileMeta.mimeType);
    }
    const result = await commitClientImportService(ctx, csvText);
    revalidateClients();
    return actionOk({
      created: result.created,
      errors: result.errors,
      counts: result.counts,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** @deprecated Usa previewClientImport + commitClientImport. */
export async function importClientsCsv(
  csvText: string,
): Promise<
  ActionResult<{ created: number; errors: Array<{ row: number; message: string }> }>
> {
  return commitClientImport(csvText);
}

export type MergeTargetDto = {
  id: string;
  clientCode: string;
  fullName: string;
  email: string | null;
};

/** Busca candidatos a destino para unir (excluye origen y archivados). */
export async function searchMergeTargets(
  sourceClientId: string,
  q: string,
): Promise<ActionResult<{ items: MergeTargetDto[] }>> {
  try {
    const ctx = await requirePermission("clients.edit");
    const sourceId = cuidSchema.parse(sourceClientId);
    const query = q.trim();
    if (query.length < 1) {
      return actionOk({ items: [] });
    }
    const result = await clientService.listClients(ctx, {
      q: query,
      limit: 10,
    });
    const items = result.items
      .filter((c) => c.id !== sourceId && c.status !== "ARCHIVED")
      .map((c) => ({
        id: c.id,
        clientCode: c.clientCode,
        fullName: destinationDisplayName(c.firstName, c.lastName),
        email: c.email,
      }));
    return actionOk({ items });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const mergeSchema = z.object({
  sourceClientId: cuidSchema,
  destinationClientId: cuidSchema,
  confirmDestinationName: z.string().trim().min(1),
});

export async function mergeClients(
  input: unknown,
): Promise<ActionResult<{ destinationClientId: string }>> {
  try {
    const ctx = await requirePermission("clients.edit");
    const data = mergeSchema.parse(input);
    const result = await mergeClientsService(ctx, data);
    revalidateClients(result.sourceClientId);
    revalidateClients(result.destinationClientId);
    return actionOk({ destinationClientId: result.destinationClientId });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
