import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import { practicalCards } from "@/src/lib/credit/practical";
import { planCardsFrom, type PlanCard } from "@/src/lib/credit/utilization-plan";
import { getOrgPdfInfo, selectClientActionPlanReport } from "@/src/server/credit-reports/action-plan";

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return typeof value.toNumber === "function" ? value.toNumber() : Number(value);
}

export type ScorePlanData = {
  clientName: string;
  reportId: string;
  reportDate: Date;
  provider: string | null;
  cards: PlanCard[];
};

/** Tarjetas abiertas del reporte (lectura práctica) para el Score Plan. */
export async function getScorePlanData(
  ctx: OrganizationContext,
  clientId: string,
  reportId?: string | null,
): Promise<ScorePlanData> {
  const id = reportId ?? (await selectClientActionPlanReport(ctx, clientId)).reportId;
  if (!id) throw new DomainError("Este cliente todavía no tiene reportes de crédito.");
  const report = await prisma.creditReport.findFirst({
    where: { id, organizationId: ctx.organizationId, clientId },
    include: { items: true, client: { select: { firstName: true, lastName: true } } },
  });
  if (!report) throw new DomainError("Reporte de crédito no encontrado.");
  const cards = practicalCards(
    report.items.map((item) => ({
      id: item.id,
      creditorName: item.creditorName,
      accountNumberMasked: item.accountNumberMasked,
      accountType: item.accountType,
      bureau: item.bureau,
      balance: num(item.balance),
      creditLimit: num(item.creditLimit),
      dateOpened: item.dateOpened,
      dateReported: item.dateReported,
      accountStatus: item.accountStatus,
      paymentStatus: item.paymentStatus,
      openClosedStatus: item.openClosedStatus,
      remarks: item.remarks,
      ownershipType: item.ownershipType,
      isNegative: item.isNegative,
      negativeType: item.negativeType,
    })),
  );
  return {
    clientName: [report.client.firstName, report.client.lastName].filter(Boolean).join(" "),
    reportId: report.id,
    reportDate: report.reportDate,
    provider: report.provider ?? null,
    cards: planCardsFrom(cards),
  };
}

/** PDF on-demand del Score Plan (staff). */
export async function buildScorePlanPdf(
  ctx: OrganizationContext,
  clientId: string,
  reportId: string | null,
  targetPct: number,
): Promise<{ pdf: Buffer; filename: string }> {
  const { generateScorePlanPdf } = await import("@/src/lib/pdf/score-plan");
  const data = await getScorePlanData(ctx, clientId, reportId);
  const org = await getOrgPdfInfo(ctx.organizationId);
  const pdf = generateScorePlanPdf({
    organization: {
      legalName: org.legalName,
      phone: org.phone,
      email: org.email,
      website: org.website,
      addressLine: org.addressLine,
      logo: org.logo,
    },
    data,
    targetPct,
  });
  const day = data.reportDate.toISOString().slice(0, 10);
  const safeName = data.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return { pdf, filename: `score-plan-${safeName || "cliente"}-${day}.pdf` };
}
