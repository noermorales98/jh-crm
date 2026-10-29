"use server";

import { z } from "zod";
import { requirePermission } from "@/src/server/auth/guards";
import { actionFail, actionOk, isNextControlError, type ActionResult } from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import { getFundingCalc, saveFundingProfile, type FundingCalcData } from "@/src/server/credit-reports/funding";

const money = z.number().finite().min(0).max(100_000_000).nullable();

/** Calculadora de fondeo (Action Center → Fondeo). */
export async function loadFundingCalc(input: unknown): Promise<ActionResult<FundingCalcData>> {
  try {
    const ctx = await requirePermission("creditReports.view");
    const data = z.object({ clientId: cuidSchema, reportId: cuidSchema.nullable().optional() }).parse(input);
    return actionOk(await getFundingCalc(ctx, data.clientId, data.reportId ?? null));
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** Guarda ingreso, ventas y tiempo del negocio en la ficha del cliente. */
export async function saveFundingProfileAction(input: unknown): Promise<ActionResult<undefined>> {
  try {
    const ctx = await requirePermission("clients.edit");
    const data = z
      .object({
        clientId: cuidSchema,
        profile: z.object({
          hasBusiness: z.boolean(),
          monthlyIncome: money,
          monthlyRevenue: money,
          timeInBusiness: z.enum(["LT6M", "6TO12M", "1TO2Y", "2Y_PLUS"]).nullable(),
          monthlyDebtOverride: money,
        }),
      })
      .parse(input);
    await saveFundingProfile(ctx, data.clientId, data.profile);
    return actionOk(undefined);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
