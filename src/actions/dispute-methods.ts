"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import { actionFail, actionOk, isNextControlError, type ActionResult } from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import * as disputeService from "@/src/server/disputes";
import * as letterService from "@/src/server/letters";
import { DISPUTE_STRATEGIES, PERSONAL_INFO_KINDS, personalInfoLabel } from "@/src/lib/disputes/strategies";
import { CASE_ROUTE_PATTERN } from "@/src/lib/routes/case-routes";

const bureau = z.enum(["EXPERIAN", "EQUIFAX", "TRANSUNION"]);

/** Agrega a la ronda consultas duras del reporte o datos personales a corregir. */
export async function addInquiryOrPersonalDisputesAction(
  input: unknown,
): Promise<ActionResult<{ added: number }>> {
  try {
    const ctx = await requirePermission("disputes.manage");
    const data = z
      .object({
        roundId: cuidSchema,
        inquiries: z
          .array(z.object({ inquiryId: cuidSchema, bureau, label: z.string().min(1).max(180) }))
          .max(30)
          .default([]),
        personal: z
          .array(z.object({ bureau, kind: z.enum(PERSONAL_INFO_KINDS), value: z.string().trim().min(2).max(160) }))
          .max(30)
          .default([]),
      })
      .parse(input);
    let added = 0;
    for (const inquiry of data.inquiries) {
      await disputeService.addNonAccountDisputeItem(ctx, {
        roundId: data.roundId,
        bureau: inquiry.bureau,
        kind: "INQUIRY",
        inquiryId: inquiry.inquiryId,
        label: inquiry.label,
        disputeReason: "I did not authorize this inquiry. Please show its permissible purpose or delete it.",
      });
      added += 1;
    }
    for (const entry of data.personal) {
      await disputeService.addNonAccountDisputeItem(ctx, {
        roundId: data.roundId,
        bureau: entry.bureau,
        kind: "PERSONAL_INFO",
        label: personalInfoLabel(entry.kind, entry.value),
        disputeReason: "This information is not mine or is out of date. Please remove it.",
      });
      added += 1;
    }
    revalidatePath(CASE_ROUTE_PATTERN, "layout");
    return actionOk({ added });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** Cambia el método de una disputa (antes de generar su carta). */
export async function setDisputeStrategyAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const ctx = await requirePermission("disputes.manage");
    const data = z.object({ disputeItemId: cuidSchema, strategy: z.enum(DISPUTE_STRATEGIES) }).parse(input);
    await disputeService.updateDisputeItem(ctx, data.disputeItemId, { strategy: data.strategy });
    revalidatePath(CASE_ROUTE_PATTERN, "layout");
    return actionOk(undefined);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** Arma una carta por buró y método, y opcionalmente una queja al CFPB por buró. */
export async function generateLettersByStrategyAction(
  input: unknown,
): Promise<ActionResult<{ letters: number; complaints: number }>> {
  try {
    const ctx = await requirePermission("letters.manage");
    const data = z.object({ roundId: cuidSchema, cfpb: z.boolean().default(false) }).parse(input);
    const result = await letterService.generateLettersByStrategy(ctx, data);
    revalidatePath(CASE_ROUTE_PATTERN, "layout");
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** Guarda el Complaint ID del CFPB y la fecha de revisión. */
export async function updateLetterFollowUpAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const ctx = await requirePermission("letters.manage");
    const data = z
      .object({
        letterId: cuidSchema,
        complaintId: z.string().max(40).nullable().optional(),
        followUpAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
      .parse(input);
    await letterService.updateLetterFollowUp(ctx, data.letterId, {
      complaintId: data.complaintId,
      followUpAt:
        data.followUpAt === undefined ? undefined : data.followUpAt === null ? null : new Date(`${data.followUpAt}T12:00:00.000Z`),
    });
    revalidatePath(CASE_ROUTE_PATTERN, "layout");
    return actionOk(undefined);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
