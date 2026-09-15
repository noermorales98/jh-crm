"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { leadMessageCreateSchema, serviceCaseNoteCreateSchema } from "@/src/lib/validation/notes";
import * as notes from "@/src/server/notes";

/** NT-001 — Nota humana en la ficha del expediente (ServiceCase). */
export async function addServiceCaseNoteAction(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string | null;
  }>
> {
  try {
    const ctx = await requirePermission("cases.manage");
    const data = serviceCaseNoteCreateSchema.parse(input);
    const note = await notes.createServiceCaseNote(ctx, {
      caseId: data.caseId,
      body: data.body,
    });

    revalidatePath(`/crm/casos/${data.caseId}`);
    revalidatePath(`/crm/casos/${data.caseId}/actividad`);

    return actionOk({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      authorName: note.author.name,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function addLeadMessageAction(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string | null;
  }>
> {
  try {
    const ctx = await requirePermission("opportunities.manage");
    const data = leadMessageCreateSchema.parse(input);
    const note = await notes.createClientNote(ctx, {
      clientId: data.clientId,
      body: data.body,
      opportunityId: data.opportunityId,
    });

    revalidatePath("/crm/oportunidades", "layout");
    revalidatePath("/crm/oportunidades", "page");
    revalidatePath(`/crm/clientes/${data.clientId}`);
    revalidatePath(`/crm/clientes/${data.clientId}/actividad`);
    revalidatePath(`/crm/clientes/${data.clientId}/notas`);

    return actionOk({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      authorName: note.author.name,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** Nota humana en ficha de cliente (CL-002 / NT-001). */
export async function addClientNoteAction(
  input: unknown,
): Promise<
  ActionResult<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string | null;
  }>
> {
  try {
    const ctx = await requirePermission("clients.edit");
    const data = leadMessageCreateSchema.parse(input);
    const note = await notes.createClientNote(ctx, {
      clientId: data.clientId,
      body: data.body,
      opportunityId: data.opportunityId,
    });

    revalidatePath(`/crm/clientes/${data.clientId}`);
    revalidatePath(`/crm/clientes/${data.clientId}/notas`);
    revalidatePath(`/crm/clientes/${data.clientId}/actividad`);

    return actionOk({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      authorName: note.author.name,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
