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
import { cuidSchema } from "@/src/lib/validation/common";
import * as roundService from "@/src/server/rounds";

function revalidateRounds() {
  revalidatePath("/crm/rondas");
  revalidatePath("/crm/casos");
  revalidatePath("/crm/dashboard");
}

const createRoundSchema = z.object({
  caseId: cuidSchema,
  notes: z.string().trim().max(5000).nullish(),
  lettersCount: z.number().int().min(0).optional(),
});

export async function createRound(
  input: unknown,
): Promise<ActionResult<{ id: string; roundNumber: number }>> {
  try {
    const ctx = await requirePermission("rounds.manage");
    const data = createRoundSchema.parse(input);
    const round = await roundService.createRound(ctx, data);
    revalidateRounds();
    return actionOk({ id: round.id, roundNumber: round.roundNumber });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const updateRoundSchema = z.object({
  notes: z.string().trim().max(5000).nullish(),
  lettersCount: z.number().int().min(0).optional(),
});

export async function updateRound(
  roundId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("rounds.manage");
    const id = cuidSchema.parse(roundId);
    const data = updateRoundSchema.parse(input);
    const round = await roundService.updateRound(ctx, id, data);
    revalidateRounds();
    return actionOk({ id: round.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const markSentSchema = z.object({
  expectedReviewAt: z.coerce.date({ error: "Indica la fecha esperada de revisión." }),
  createReviewTask: z.boolean().optional(),
  assignedToId: cuidSchema.optional(),
  reminderAt: z.coerce.date().optional(),
});

export async function markRoundSent(
  roundId: string,
  input: unknown,
): Promise<ActionResult<{ id: string; reviewTaskId: string | null }>> {
  try {
    const ctx = await requirePermission("rounds.manage");
    const id = cuidSchema.parse(roundId);
    const data = markSentSchema.parse(input);
    const result = await roundService.markRoundSent(ctx, id, data);
    revalidateRounds();
    revalidatePath("/crm/tareas");
    return actionOk({
      id: result.round.id,
      reviewTaskId: result.reviewTask?.id ?? null,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const markReviewedSchema = z.object({
  outcome: z.enum(["COMPLETED", "REVIEWING"]).optional(),
  notes: z.string().trim().max(5000).nullish(),
});

export async function markRoundReviewed(
  roundId: string,
  input: unknown = {},
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const ctx = await requirePermission("rounds.manage");
    const id = cuidSchema.parse(roundId);
    const data = markReviewedSchema.parse(input);
    const round = await roundService.markRoundReviewed(ctx, id, data);
    revalidateRounds();
    return actionOk({ id: round.id, status: round.status });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function cancelRound(roundId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("rounds.manage");
    const id = cuidSchema.parse(roundId);
    const round = await roundService.cancelRound(ctx, id);
    revalidateRounds();
    return actionOk({ id: round.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
