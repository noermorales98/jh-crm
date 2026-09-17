"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import {
  analyzeCreditPdfInputSchema,
  confirmCreditPdfImportSchema,
} from "@/src/lib/validation/credit-import";
import { cuidSchema } from "@/src/lib/validation/common";
import * as creditImport from "@/src/server/credit-import";
import {
  getCreditPdfImportJob,
  listActiveCreditPdfImportJobs,
  processCreditPdfImportJob,
  startCreditPdfImportJob,
} from "@/src/server/credit-import/jobs";

function revalidateCredit(caseId: string, reportId?: string) {
  revalidatePath(`/crm/casos/${caseId}`);
  revalidatePath(`/crm/casos/${caseId}/credito`);
  revalidatePath(`/crm/casos/${caseId}/documentos`);
  if (reportId) {
    revalidatePath(`/crm/casos/${caseId}/credito/reportes/${reportId}`);
  }
}

export async function listAnalyzableCreditPdfsAction(
  caseId: string,
): Promise<
  ActionResult<
    Awaited<ReturnType<typeof creditImport.listAnalyzableCreditPdfs>>
  >
> {
  try {
    const ctx = await requirePermission("creditReports.manage");
    const data = await creditImport.listAnalyzableCreditPdfs(ctx, caseId);
    return actionOk(data);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** Encola análisis en segundo plano; el cliente debe ir a la página de progreso. */
export async function startCreditPdfImportAction(
  input: unknown,
): Promise<
  ActionResult<{ jobId: string; caseId: string; progressPath: string }>
> {
  try {
    const ctx = await requirePermission("creditReports.manage");
    const data = analyzeCreditPdfInputSchema.parse(input);
    const started = await startCreditPdfImportJob(ctx, data);
    after(() => processCreditPdfImportJob(started.jobId));
    revalidatePath(started.progressPath);
    return actionOk(started);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** @deprecated Prefer startCreditPdfImportAction + job. Mantiene sync para smoke. */
export async function analyzeCreditPdfAction(
  input: unknown,
): Promise<
  ActionResult<Awaited<ReturnType<typeof creditImport.analyzeCreditPdf>>>
> {
  try {
    const ctx = await requirePermission("creditReports.manage");
    const data = analyzeCreditPdfInputSchema.parse(input);
    const result = await creditImport.analyzeCreditPdf(ctx, data);
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function getCreditPdfImportJobAction(
  jobId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof getCreditPdfImportJob>>>> {
  try {
    const ctx = await requirePermission("creditReports.manage");
    const id = cuidSchema.parse(jobId);
    const job = await getCreditPdfImportJob(ctx, id);
    return actionOk(job);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function listActiveCreditPdfImportJobsAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof listActiveCreditPdfImportJobs>>>
> {
  try {
    const ctx = await requirePermission("creditReports.manage");
    const jobs = await listActiveCreditPdfImportJobs(ctx);
    return actionOk(jobs);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function confirmCreditPdfImportAction(
  input: unknown,
): Promise<ActionResult<{ reportId: string; caseId: string }>> {
  try {
    const ctx = await requirePermission("creditReports.manage");
    const data = confirmCreditPdfImportSchema.parse(input);
    const result = await creditImport.confirmCreditPdfImport(ctx, data);
    revalidateCredit(result.caseId, result.reportId);
    revalidatePath(`/crm/clientes/${result.clientId}`);
    return actionOk({ reportId: result.reportId, caseId: result.caseId });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
