"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import { actionFail, actionOk, isNextControlError, type ActionResult } from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  createRoundFromNegativeReview,
  getNegativeReview,
  saveNegativeInterview,
  type NegativeReview,
} from "@/src/server/credit-reports/negative-review";
import { CASE_ROUTE_PATTERN } from "@/src/lib/routes/case-routes";
import { DISPUTE_STRATEGIES } from "@/src/lib/disputes/strategies";

const answerSchema = z.enum(["NOT_MINE", "PAID", "WRONG_DATA", "CORRECT", "UNKNOWN"]);
const reasonSchema = z.enum(["INCONSISTENT", "DUPLICATE", "INCOMPLETE", "OBSOLETE", "VERIFY"]);

/** Cuentas negativas agrupadas por deuda (Action Center → Análisis). */
export async function loadNegativeReview(input: unknown): Promise<ActionResult<NegativeReview>> {
  try {
    const ctx = await requirePermission("creditReports.view");
    const data = z
      .object({ clientId: cuidSchema, reportId: cuidSchema.nullable().optional() })
      .parse(input);
    return actionOk(await getNegativeReview(ctx, data.clientId, data.reportId ?? null));
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** Guarda la entrevista del cliente sobre una deuda. */
export async function saveNegativeInterviewAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const ctx = await requirePermission("disputes.manage");
    const data = z
      .object({
        clientId: cuidSchema,
        itemIds: z.array(cuidSchema).min(1).max(10),
        answer: answerSchema.nullable(),
        words: z.string().max(2000).nullable(),
      })
      .parse(input);
    await saveNegativeInterview(ctx, data);
    return actionOk(undefined);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** Crea la ronda de disputas con las deudas elegidas y sus cartas por buró. */
export async function createRoundFromNegativesAction(
  input: unknown,
): Promise<ActionResult<{ roundId: string; roundNumber: number; disputes: number; letters: number }>> {
  try {
    const ctx = await requirePermission("rounds.manage");
    const data = z
      .object({
        clientId: cuidSchema,
        reportId: cuidSchema,
        selections: z
          .array(
            z.object({
              itemIds: z.array(cuidSchema).min(1).max(10),
              reasons: z.array(reasonSchema).max(5),
              strategy: z.enum(DISPUTE_STRATEGIES).optional(),
            }),
          )
          .min(1)
          .max(60),
      })
      .parse(input);
    const result = await createRoundFromNegativeReview(ctx, data);
    revalidatePath(CASE_ROUTE_PATTERN, "layout");
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
