"use server";

import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import { actionFail, actionOk, isNextControlError, type ActionResult } from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import { summarizeCreditAnalysis } from "@/src/server/ai/tasks";

/** Resumen con IA del Análisis de Crédito (bajo demanda, no se guarda). */
export async function summarizeCreditAnalysisAction(
  reportId: string,
): Promise<ActionResult<{ summary: string }>> {
  try {
    const ctx = await requirePermission("creditReports.view");
    const id = z.object({ reportId: cuidSchema }).parse({ reportId }).reportId;
    return actionOk(await summarizeCreditAnalysis(ctx, id));
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
