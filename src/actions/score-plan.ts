"use server";

import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import { actionFail, actionOk, isNextControlError, type ActionResult } from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import { getScorePlanData, type ScorePlanData } from "@/src/server/credit-reports/score-plan";

/** Tarjetas abiertas del reporte para el Score Plan (Action Center). */
export async function loadScorePlan(input: unknown): Promise<ActionResult<ScorePlanData>> {
  try {
    const ctx = await requirePermission("creditReports.view");
    const data = z
      .object({ clientId: cuidSchema, reportId: cuidSchema.nullable().optional() })
      .parse(input);
    return actionOk(await getScorePlanData(ctx, data.clientId, data.reportId ?? null));
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
