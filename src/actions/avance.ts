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
import { getAvanceViewForOrg, type AvanceViewData } from "@/src/server/avance/view";
import { avanceShareUrl } from "@/src/server/avance/share";

const schema = z.object({
  clientId: cuidSchema,
  reportId: cuidSchema.optional().nullable(),
  caseId: cuidSchema.optional().nullable(),
});

export async function loadClientAvance(
  input: unknown,
): Promise<ActionResult<AvanceViewData>> {
  try {
    const ctx = await requirePermission("creditReports.view");
    const data = schema.parse(input);
    const view = await getAvanceViewForOrg(
      ctx,
      data.clientId,
      data.reportId,
      data.caseId,
    );
    return actionOk(view);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function getClientAvanceShareLink(
  input: unknown,
): Promise<ActionResult<{ url: string }>> {
  try {
    const ctx = await requirePermission("creditReports.view");
    const data = schema.parse(input);
    // Valida acceso al cliente
    await getAvanceViewForOrg(
      ctx,
      data.clientId,
      data.reportId,
      data.caseId,
    );
    return actionOk({
      url: avanceShareUrl(ctx.organizationId, data.clientId),
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
