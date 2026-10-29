import type { Prisma } from "@prisma/client";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import {
  parseFundingProfile,
  type FundingCreditFacts,
  type FundingProfile,
} from "@/src/lib/credit/funding-calc";
import { getClientActionPlan } from "@/src/server/credit-reports/action-plan";
import { getNegativeReview } from "@/src/server/credit-reports/negative-review";

export type FundingCalcData = {
  clientName: string;
  reportId: string;
  reportDate: Date;
  facts: FundingCreditFacts;
  profile: FundingProfile;
};

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return typeof value.toNumber === "function" ? value.toNumber() : Number(value);
}

/**
 * Pagos mensuales de cuentas abiertas del reporte, contando una vez la misma
 * cuenta aunque la reporten los tres burós (acreedor + mes de apertura).
 */
async function reportMonthlyDebt(ctx: OrganizationContext, reportId: string): Promise<number | null> {
  const items = await prisma.creditItem.findMany({
    where: { organizationId: ctx.organizationId, reportId },
    select: { creditorName: true, dateOpened: true, monthlyPayment: true, openClosedStatus: true, accountStatus: true, isNegative: true },
  });
  const byAccount = new Map<string, number>();
  for (const item of items) {
    const payment = num(item.monthlyPayment);
    if (payment == null || payment <= 0) continue;
    const closed = /closed|cerrad/i.test(`${item.openClosedStatus ?? ""} ${item.accountStatus ?? ""}`);
    if (closed || item.isNegative) continue;
    const key = `${item.creditorName.toLowerCase().replace(/[^a-z0-9]/g, "")}#${item.dateOpened?.toISOString().slice(0, 7) ?? "?"}`;
    byAccount.set(key, Math.max(byAccount.get(key) ?? 0, payment));
  }
  if (items.length === 0) return null;
  return [...byAccount.values()].reduce((sum, p) => sum + p, 0);
}

/** Datos para la calculadora de fondeo: lectura del reporte + perfil guardado. */
export async function getFundingCalc(
  ctx: OrganizationContext,
  clientId: string,
  reportId?: string | null,
): Promise<FundingCalcData> {
  const [plan, client] = await Promise.all([
    getClientActionPlan(ctx, clientId, reportId),
    prisma.client.findFirst({
      where: { id: clientId, organizationId: ctx.organizationId },
      select: { fundingProfile: true },
    }),
  ]);
  if (!client) throw new DomainError("Cliente no encontrado.");
  const review = await getNegativeReview(ctx, clientId, plan.reportId);
  const oldIds = new Set(plan.negativeAccounts.filter((n) => n.old).map((n) => n.id));
  const blocking = review.debts.filter((debt) => debt.rows.some((row) => !oldIds.has(row.itemId))).length;
  const inquiries = plan.bureaus.map((b) => b.inquiries).filter((n): n is number => n != null);
  return {
    clientName: plan.clientName,
    reportId: plan.reportId,
    reportDate: plan.reportDate,
    facts: {
      scores: plan.bureaus.map((b) => b.score),
      blockingNegatives: blocking,
      utilizationBps: plan.revolving.utilizationBps,
      inquiries6m: inquiries.length > 0 ? Math.max(...inquiries) : null,
      reportMonthlyDebt: await reportMonthlyDebt(ctx, plan.reportId),
    },
    profile: parseFundingProfile(client.fundingProfile),
  };
}

/** Guarda lo que declara el cliente para la calculadora. */
export async function saveFundingProfile(ctx: OrganizationContext, clientId: string, profile: FundingProfile) {
  const updated = await prisma.client.updateMany({
    where: { id: clientId, organizationId: ctx.organizationId },
    data: { fundingProfile: { ...profile, updatedAt: new Date().toISOString() } as Prisma.InputJsonValue },
  });
  if (updated.count === 0) throw new DomainError("Cliente no encontrado.");
}
