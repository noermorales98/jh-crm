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

function parseCsvRows(text: string): string[][] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  });
}

/** Importa CSV name,email o firstName,lastName,email. */
export async function importClientsCsv(
  csvText: string,
): Promise<
  ActionResult<{ created: number; errors: Array<{ row: number; message: string }> }>
> {
  try {
    const ctx = await requirePermission("clients.create");
    const rows = parseCsvRows(csvText);
    if (rows.length === 0) {
      return actionFail(new Error("El CSV está vacío."));
    }

    const header = rows[0].map((h) => h.toLowerCase());
    const hasHeader =
      header.includes("email") ||
      header.includes("name") ||
      header.includes("firstname") ||
      header.includes("first_name");
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const col = (names: string[]) =>
      names
        .map((n) => header.indexOf(n))
        .find((i) => i >= 0);

    const nameIdx = hasHeader
      ? (col(["name", "nombre", "full_name", "fullname"]) ?? -1)
      : 0;
    const firstIdx = hasHeader
      ? (col(["firstname", "first_name", "first", "nombre"]) ?? -1)
      : -1;
    const lastIdx = hasHeader
      ? (col(["lastname", "last_name", "last", "apellido"]) ?? -1)
      : -1;
    const emailIdx = hasHeader
      ? (col(["email", "correo", "mail"]) ?? -1)
      : 1;

    let created = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + (hasHeader ? 2 : 1);
      try {
        let firstName = "";
        let lastName = "";
        if (firstIdx >= 0) {
          firstName = row[firstIdx] ?? "";
          lastName = lastIdx >= 0 ? (row[lastIdx] ?? "") : "";
        } else if (nameIdx >= 0) {
          const parts = (row[nameIdx] ?? "").trim().split(/\s+/);
          firstName = parts[0] ?? "";
          lastName = parts.slice(1).join(" ");
        } else {
          firstName = row[0] ?? "";
        }
        const email =
          emailIdx >= 0 ? (row[emailIdx] ?? "").trim() : (row[1] ?? "").trim();

        const data = clientCreateSchema.parse({
          firstName,
          lastName: lastName || undefined,
          email: email || undefined,
        });
        await clientService.createClient(ctx, data);
        created += 1;
      } catch (error) {
        errors.push({
          row: rowNum,
          message:
            error instanceof Error ? error.message : "Fila inválida.",
        });
      }
    }

    revalidateClients();
    return actionOk({ created, errors });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
