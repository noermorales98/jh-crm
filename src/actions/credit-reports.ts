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
import {
  getClientActionPlan,
  getClientNegativeAnalysis,
} from "@/src/server/credit-reports/action-plan";
import { z } from "zod";

function revalidateCredit(
  caseId: string,
  opts?: { reportId?: string; clientId?: string },
) {
  revalidatePath(`/crm/casos/${caseId}`);
  revalidatePath(`/crm/casos/${caseId}/credito`);
  if (opts?.reportId) {
    revalidatePath(`/crm/casos/${caseId}/credito/reportes/${opts.reportId}`);
  }
  if (opts?.clientId) {
    revalidatePath(`/crm/clientes/${opts.clientId}`);
    revalidatePath(`/crm/clientes/${opts.clientId}/reportes`);
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
    revalidateCredit(report.caseId, {
      reportId: report.id,
      clientId: report.clientId,
    });
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
    revalidateCredit(report.caseId, {
      reportId: report.id,
      clientId: report.clientId,
    });
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
    revalidateCredit(created.caseId, {
      reportId: created.reportId,
      clientId: created.clientId,
    });
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
    revalidateCredit(item.caseId, {
      reportId: item.reportId,
      clientId: item.clientId,
    });
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
    revalidateCredit(result.caseId, {
      reportId: result.reportId,
      clientId: result.clientId,
    });
    return actionOk({ id: result.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

const negativeAnalysisSchema = z.object({
  clientId: cuidSchema,
  reportId: cuidSchema.optional().nullable(),
});

export type ClientNegativeAnalysisDto = Awaited<
  ReturnType<typeof getClientNegativeAnalysis>
>;

/** Análisis categorizado de cuentas negativas (Action Center → Análisis). */
export async function loadClientNegativeAnalysis(
  input: unknown,
): Promise<ActionResult<ClientNegativeAnalysisDto>> {
  try {
    const ctx = await requirePermission("creditReports.view");
    const data = negativeAnalysisSchema.parse(input);
    const analysis = await getClientNegativeAnalysis(
      ctx,
      data.clientId,
      data.reportId,
    );
    return actionOk(analysis);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export type ClientActionPlanHubDto = {
  reportId: string;
  qualified: boolean;
  avgScore: number | null;
  avgUtilization: number | null;
  bureausApproved: number;
  verdict: string;
  revolving: {
    openCards: number;
    auCards: number;
    totalLimit: number;
    totalUsed: number;
    utilPct: number | null;
    cards: {
      creditorName: string;
      limit: number | null;
      balance: number | null;
      utilization: number | null;
    }[];
  };
};

export type SuggestedQuoteLine = {
  description: string;
  detail: string;
  quantity: number;
  unitPrice: number;
};

/** Líneas de cotización sugeridas desde negativos del reporte (estilo Fondify). */
export async function suggestQuoteLinesFromReport(
  input: unknown,
): Promise<ActionResult<SuggestedQuoteLine[]>> {
  try {
    const ctx = await requirePermission("creditReports.view");
    const data = negativeAnalysisSchema.parse(input);
    const analysis = await getClientNegativeAnalysis(
      ctx,
      data.clientId,
      data.reportId,
    );
    const lines: SuggestedQuoteLine[] = [
      {
        description: "Asesoría",
        detail: "Asesoría general y estrategia de reparación",
        quantity: 1,
        unitPrice: 120,
      },
    ];
    for (const g of analysis.groups) {
      if (g.count === 0) continue;
      const creditors = g.items
        .map((i) => i.creditorName)
        .filter(Boolean)
        .slice(0, 6)
        .join(", ");
      if (g.key === "charge_off") {
        lines.push({
          description: "Charge Off",
          detail: creditors || g.title,
          quantity: g.count,
          unitPrice: 250,
        });
      } else if (g.key === "late") {
        lines.push({
          description: "Pagos Tardíos",
          detail: creditors || g.title,
          quantity: g.count,
          unitPrice: 250,
        });
      } else if (g.key === "personal_data") {
        lines.push({
          description: "Información personal",
          detail: creditors || g.description,
          quantity: Math.max(1, Math.min(g.count, 3)),
          unitPrice: 100,
        });
      } else if (g.key === "inquiry") {
        lines.push({
          description: "Consultas duras",
          detail:
            "Consultas duras (hard inquiries) no conectadas a cuentas abiertas",
          quantity: g.count,
          unitPrice: 20,
        });
      }
    }
    return actionOk(lines);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

/** Resumen del plan para Score Plan / Fondeo en el hub. */
export async function loadClientActionPlanHub(
  input: unknown,
): Promise<ActionResult<ClientActionPlanHubDto>> {
  try {
    const ctx = await requirePermission("creditReports.view");
    const data = negativeAnalysisSchema.parse(input);
    const plan = await getClientActionPlan(
      ctx,
      data.clientId,
      data.reportId,
    );
    return actionOk({
      reportId: plan.reportId,
      qualified: plan.qualified,
      avgScore: plan.avgScore,
      avgUtilization: plan.avgUtilization,
      bureausApproved: plan.bureausApproved,
      verdict: plan.verdict,
      revolving: {
        openCards: plan.revolving.openCards,
        auCards: plan.revolving.auCards,
        totalLimit: plan.revolving.totalLimit,
        totalUsed: plan.revolving.totalUsed,
        utilPct: plan.revolving.utilPct,
        cards: plan.revolving.cards.map((c) => ({
          creditorName: c.creditorName,
          limit: c.limit,
          balance: c.balance,
          utilization: c.utilization,
        })),
      },
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
