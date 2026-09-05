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
  createComparisonSchema,
  overrideComparisonItemSchema,
} from "@/src/lib/validation/comparisons";
import * as comparisonService from "@/src/server/comparisons";

function revalidateComparisons(caseId: string, comparisonId?: string) {
  revalidatePath(`/crm/casos/${caseId}`);
  revalidatePath(`/crm/casos/${caseId}/credito`);
  if (comparisonId) {
    revalidatePath(`/crm/casos/${caseId}/comparaciones/${comparisonId}`);
  }
}

export async function createComparison(
  input: unknown,
): Promise<ActionResult<{ id: string; caseId: string }>> {
  try {
    const ctx = await requirePermission("comparisons.manage");
    const data = createComparisonSchema.parse(input);
    const comparison = await comparisonService.createComparison(ctx, data);
    revalidateComparisons(comparison.caseId, comparison.id);
    return actionOk({ id: comparison.id, caseId: comparison.caseId });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function overrideComparisonItem(
  itemId: string,
  input: unknown,
): Promise<ActionResult<{ comparisonId: string }>> {
  try {
    const ctx = await requirePermission("comparisons.manage");
    const id = cuidSchema.parse(itemId);
    const data = overrideComparisonItemSchema.parse(input);
    const comparison = await comparisonService.overrideComparisonItem(
      ctx,
      id,
      data,
    );
    revalidateComparisons(comparison.caseId, comparison.id);
    return actionOk({ comparisonId: comparison.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
