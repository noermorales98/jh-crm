"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  createLetterDraftSchema,
  createLetterTemplateSchema,
  generateProgressReportSchema,
  markLetterSentSchema,
  previewLetterSchema,
  updateLetterDraftSchema,
  updateLetterTemplateSchema,
} from "@/src/lib/validation/letters";
import * as letterService from "@/src/server/letters";
import * as progressService from "@/src/server/progress-reports";

function revalidateRound(caseId: string, roundId: string) {
  revalidatePath(`/crm/casos/${caseId}`);
  revalidatePath(`/crm/casos/${caseId}/rondas`);
  revalidatePath(`/crm/casos/${caseId}/rondas/${roundId}`);
  revalidatePath(`/crm/casos/${caseId}/documentos`);
  revalidatePath(`/crm/casos/${caseId}/credito`);
}

export async function ensureLetterTemplates(): Promise<
  ActionResult<{ count: number }>
> {
  try {
    const ctx = await requirePermission("letters.manage");
    const templates = await letterService.ensureDefaultTemplates(ctx);
    return actionOk({ count: templates.length });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function createLetterTemplate(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("letters.manage");
    const data = createLetterTemplateSchema.parse(input);
    const t = await letterService.createTemplate(ctx, data);
    revalidatePath("/crm/configuracion");
    return actionOk({ id: t.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateLetterTemplate(
  templateId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("letters.manage");
    const id = cuidSchema.parse(templateId);
    const data = updateLetterTemplateSchema.parse(input);
    const t = await letterService.updateTemplate(ctx, id, data);
    return actionOk({ id: t.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function previewDisputeLetter(
  input: unknown,
): Promise<
  ActionResult<{ subject: string; content: string; recipient: string }>
> {
  try {
    const ctx = await requirePermission("letters.view");
    const data = previewLetterSchema.parse(input);
    const preview = await letterService.previewLetter(ctx, data);
    return actionOk({
      subject: preview.subject,
      content: preview.content,
      recipient: preview.recipient,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function createDisputeLetterDraft(
  input: unknown,
): Promise<ActionResult<{ id: string; roundId: string }>> {
  try {
    const ctx = await requirePermission("letters.manage");
    const data = createLetterDraftSchema.parse(input);
    const letter = await letterService.createLetterDraft(ctx, data);
    const full = await letterService.getLetter(ctx, letter.id);
    revalidateRound(full.round.caseId, letter.roundId);
    return actionOk({ id: letter.id, roundId: letter.roundId });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateDisputeLetterDraft(
  letterId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("letters.manage");
    const id = cuidSchema.parse(letterId);
    const data = updateLetterDraftSchema.parse(input);
    const letter = await letterService.updateLetterDraft(ctx, id, data);
    const full = await letterService.getLetter(ctx, letter.id);
    revalidateRound(full.round.caseId, letter.roundId);
    return actionOk({ id: letter.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function finalizeDisputeLetter(
  letterId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("letters.manage");
    const id = cuidSchema.parse(letterId);
    const result = await letterService.finalizeLetter(ctx, id);
    const full = await letterService.getLetter(ctx, result.letter.id);
    revalidateRound(full.round.caseId, result.letter.roundId);
    return actionOk({ id: result.letter.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function markDisputeLetterSent(
  letterId: string,
  input: unknown = {},
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("letters.manage");
    const id = cuidSchema.parse(letterId);
    const data = markLetterSentSchema.parse(input);
    const letter = await letterService.markLetterSent(ctx, id, data);
    const full = await letterService.getLetter(ctx, letter.id);
    revalidateRound(full.round.caseId, letter.roundId);
    return actionOk({ id: letter.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function generateClientProgressReport(
  input: unknown,
): Promise<ActionResult<{ reportId: string; caseId: string }>> {
  try {
    const ctx = await requirePermission("letters.manage");
    const data = generateProgressReportSchema.parse(input);
    const report = await progressService.createClientProgressReport(ctx, data);
    revalidatePath(`/crm/casos/${data.caseId}`);
    revalidatePath(`/crm/casos/${data.caseId}/credito`);
    if (data.roundId) {
      revalidatePath(`/crm/casos/${data.caseId}/rondas/${data.roundId}`);
    }
    revalidatePath(`/crm/casos/${data.caseId}/reportes/${report.id}`);
    return actionOk({ reportId: report.id, caseId: data.caseId });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
