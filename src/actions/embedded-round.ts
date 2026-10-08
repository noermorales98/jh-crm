"use server";

import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  getEmbeddedLetterDetail,
  getEmbeddedRoundDetail,
  type EmbeddedLetterDetail,
  type EmbeddedRoundDetail,
} from "@/src/server/rounds/embedded-detail";

const roundSchema = z.object({ roundId: cuidSchema });
const letterSchema = z.object({ letterId: cuidSchema });

export async function loadEmbeddedRoundDetail(
  input: unknown,
): Promise<ActionResult<EmbeddedRoundDetail>> {
  try {
    const ctx = await requirePermission("rounds.view");
    const { roundId } = roundSchema.parse(input);
    const data = await getEmbeddedRoundDetail(ctx, roundId);
    return actionOk(data);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function loadEmbeddedLetterDetail(
  input: unknown,
): Promise<ActionResult<EmbeddedLetterDetail>> {
  try {
    const ctx = await requirePermission("letters.view");
    const { letterId } = letterSchema.parse(input);
    const data = await getEmbeddedLetterDetail(ctx, letterId);
    return actionOk(data);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
