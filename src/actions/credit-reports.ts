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
  addCreditItemSchema,
  createCreditReportSchema,
  updateCreditItemSchema,
  updateCreditReportSchema,
} from "@/src/lib/validation/credit-reports";
import * as creditReportService from "@/src/server/credit-reports";

function revalidateCredit(caseId: string, reportId?: string) {
  revalidatePath(`/crm/casos/${caseId}`);
  revalidatePath(`/crm/casos/${caseId}/credito`);
  if (reportId) {
    revalidatePath(`/crm/casos/${caseId}/credito/reportes/${reportId}`);
  }
  revalidatePath("/crm/dashboard");
}

export async function createCreditReport(
  input: unknown,
): Promise<ActionResult<{ id: string; caseId: string }>> {
  try {
    const ctx = await requirePermission("creditReports.manage");
    const data = createCreditReportSchema.parse(input);
    const report = await creditReportService.createCreditReport(ctx, data);
    revalidateCredit(report.caseId, report.id);
    return actionOk({ id: report.id, caseId: report.caseId });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateCreditReport(
  reportId: string,
  input: unknown,
): Promise<ActionResult<{ id: string; caseId: string }>> {
  try {
    const ctx = await requirePermission("creditReports.manage");
    const id = cuidSchema.parse(reportId);
    const data = updateCreditReportSchema.parse(input);
    const report = await creditReportService.updateCreditReport(ctx, id, data);
    revalidateCredit(report.caseId, report.id);
    return actionOk({ id: report.id, caseId: report.caseId });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function addCreditItem(
  input: unknown,
): Promise<ActionResult<{ id: string; reportId: string }>> {
  try {
    const ctx = await requirePermission("creditItems.manage");
    const data = addCreditItemSchema.parse(input);
    const { reportId, ...item } = data;
    const created = await creditReportService.addCreditItem(ctx, reportId, item);
    revalidateCredit(created.caseId, created.reportId);
    return actionOk({ id: created.id, reportId: created.reportId });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function updateCreditItem(
  itemId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("creditItems.manage");
    const id = cuidSchema.parse(itemId);
    const data = updateCreditItemSchema.parse(input);
    const item = await creditReportService.updateCreditItem(ctx, id, data);
    revalidateCredit(item.caseId, item.reportId);
    return actionOk({ id: item.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function deleteCreditItem(
  itemId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("creditItems.manage");
    const id = cuidSchema.parse(itemId);
    const result = await creditReportService.deleteCreditItem(ctx, id);
    revalidateCredit(result.caseId, result.reportId);
    return actionOk({ id: result.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
