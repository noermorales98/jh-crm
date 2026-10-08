import type { OrganizationContext } from "@/src/server/auth/guards";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import {
  getClientActionPlan,
  getClientNegativeAnalysis,
} from "@/src/server/credit-reports/action-plan";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import { clientFullName } from "@/src/server/page-helpers";

export type AvanceViewData = {
  clientId: string;
  clientName: string;
  organizationName: string;
  reportId: string | null;
  reportDate: Date | null;
  roundNumber: number | null;
  roundLabel: string;
  qualified: boolean;
  verdict: string;
  bureaus: {
    bureau: string;
    score: number | null;
    label: string;
  }[];
  cleanup: {
    chargeOffs: number;
    late: number;
    inquiries: number;
    personal: number;
    other: number;
    negativeTotal: number;
  };
  rounds: {
    id: string;
    roundNumber: number;
    status: string;
    expectedReviewAt: Date | null;
  }[];
};

export async function getAvanceViewForOrg(
  ctx: OrganizationContext,
  clientId: string,
  reportId?: string | null,
  caseId?: string | null,
): Promise<AvanceViewData> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  const creditCase = caseId
    ? await prisma.creditCase.findFirst({
        where: {
          id: caseId,
          clientId,
          organizationId: ctx.organizationId,
        },
        select: {
          id: true,
          rounds: {
            orderBy: { roundNumber: "desc" },
            take: 12,
            select: {
              id: true,
              roundNumber: true,
              status: true,
              expectedReviewAt: true,
            },
          },
        },
      })
    : await prisma.creditCase.findFirst({
        where: {
          clientId,
          organizationId: ctx.organizationId,
          state: "OPEN",
        },
        orderBy: { openedAt: "desc" },
        select: {
          id: true,
          rounds: {
            orderBy: { roundNumber: "desc" },
            take: 12,
            select: {
              id: true,
              roundNumber: true,
              status: true,
              expectedReviewAt: true,
            },
          },
        },
      });

  const org = await prisma.organization.findFirst({
    where: { id: ctx.organizationId },
    select: { name: true },
  });

  const plan = await getClientActionPlan(ctx, clientId, reportId).catch(
    () => null,
  );
  const analysis = await getClientNegativeAnalysis(
    ctx,
    clientId,
    reportId ?? plan?.reportId,
  ).catch(() => null);

  const groupCount = (key: string) =>
    analysis?.groups.find((g) => g.key === key)?.count ?? 0;

  const latestRound = creditCase?.rounds[0] ?? null;

  return {
    clientId: client.id,
    clientName: clientFullName(client),
    organizationName: org?.name ?? "Agencia",
    reportId: plan?.reportId ?? null,
    reportDate: plan?.reportDate ?? null,
    roundNumber: latestRound?.roundNumber ?? null,
    roundLabel:
      latestRound != null
        ? `Ronda ${latestRound.roundNumber}`
        : "Sin ronda",
    qualified: plan?.qualified ?? false,
    verdict:
      plan?.verdict ??
      "Sube un reporte de crédito para ver el avance completo.",
    bureaus: (plan?.bureaus ?? []).map((b) => ({
      bureau: CREDIT_BUREAU_LABELS[b.bureau] ?? b.bureau,
      score: b.score,
      label: b.scoreLabel,
    })),
    cleanup: {
      chargeOffs: groupCount("charge_off"),
      late: groupCount("late"),
      inquiries: groupCount("inquiry"),
      personal: groupCount("personal_data"),
      other: groupCount("other"),
      negativeTotal: analysis?.negativeCount ?? 0,
    },
    rounds: (creditCase?.rounds ?? []).map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      status: r.status,
      expectedReviewAt: r.expectedReviewAt,
    })),
  };
}

/** Vista pública (token). Sin permisos de staff. */
export async function getAvanceViewByToken(token: string): Promise<AvanceViewData> {
  const { verifyAvanceShareToken } = await import("./share");
  const { organizationId, clientId } = verifyAvanceShareToken(token);
  const fakeCtx: OrganizationContext = {
    organizationId,
    userId: "share",
    role: "OWNER",
  };
  return getAvanceViewForOrg(fakeCtx, clientId);
}
