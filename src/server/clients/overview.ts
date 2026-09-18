import type {
  CaseState,
  CreditBureau,
  CreditItemLifecycleStatus,
  DisputeOutcome,
  PaymentMethod,
  PaymentStatus,
  RoundStatus,
} from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import {
  getCaseCreditOverview,
  type BureauScoreCurrent,
  type CaseCreditOverview,
} from "@/src/server/credit-reports";

/**
 * Overview densificado + datos para tooltips/peeks del hub cliente.
 * Sin FKs nuevas; historiales pesados solo en click (actions).
 */

export type ActiveServiceView = {
  /** Service.code (p.ej. CREDIT_REPAIR, HOME_BUYER). */
  kind: string;
  /** Solo CREDIT_REPAIR; null en otras verticales. */
  creditCaseId: string | null;
  serviceCaseId: string;
  label: string;
  caseCode: string;
  state: CaseState;
  stage: { id: string; name: string; color: string } | null;
  nextActionAt: Date | null;
};

export type BureauProgress = {
  bureau: CreditBureau;
  initial: number | null;
  current: number | null;
  deltaFromInitial: number | null;
  previousScore: number | null;
  deltaFromPrevious: number | null;
  reportDate: Date | null;
};

export type ScoreHistoryPointDto = {
  reportId: string;
  label: string;
  reportDate: Date;
  scores: Record<CreditBureau, number | null>;
};

export type ClientOverviewRound = {
  id: string;
  roundNumber: number;
  status: RoundStatus;
  sentAt: Date | null;
  expectedReviewAt: Date | null;
  reviewedAt: Date | null;
  disputedItemsCount: number;
};

export type OutcomeSummary = {
  deleted: number;
  updated: number;
  verified: number;
  other: number;
};

export type PaymentRecentDto = {
  id: string;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  receivedAt: Date | null;
  dueAt: Date | null;
  reference: string | null;
};

export type ClientOverviewCounts = {
  itemsActive: number;
  itemsResolved: number;
  itemsPending: number;
  itemsNegative: number;
  documents: number;
  openTasks: number;
  pendingPaymentsTotal: number;
  receivedPaymentsTotal: number;
  quoteTotal: number | null;
  currency: string;
};

export type ClientOverviewResult = {
  client: {
    id: string;
    clientCode: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    leadChannel: string | null;
    status: string;
    assignedToId: string | null;
    assignedTo: { id: string; name: string | null; email: string } | null;
  };
  services: ActiveServiceView[];
  activeService: ActiveServiceView | null;
  nextAction: { at: Date | null; label: string } | null;
  lastActivity: {
    id: string;
    type: string;
    description: string;
    createdAt: Date;
    actorName: string | null;
  } | null;
  latestActivities: {
    id: string;
    type: string;
    description: string;
    createdAt: Date;
  }[];
  documentsSummary: { count: number };
  tasksSummary: { openCount: number };
  paymentsSummary: {
    quoteTotal: number | null;
    received: number;
    pending: number;
    currency: string;
    recent: PaymentRecentDto[];
    /** Cotización abierta para link Stripe (si aplica). */
    payableQuote: { id: string; folio: string; status: string } | null;
  };
  credit: {
    canView: boolean;
    overview: Pick<CaseCreditOverview, "current" | "history"> | null;
    bureaus: BureauProgress[];
    scoreHistory: ScoreHistoryPointDto[];
    reportCount: number;
    hasChartData: boolean;
    round: ClientOverviewRound | null;
    roundsSummary: ClientOverviewRound[];
    roundsTotal: number;
    currentRoundId: string | null;
    itemsSummary: {
      active: number;
      pending: number;
      resolved: number;
      negative: number;
    };
    outcomeSummary: OutcomeSummary;
    counts: ClientOverviewCounts;
  } | null;
};

const ACTIVE_ITEM: CreditItemLifecycleStatus[] = [
  "IDENTIFIED",
  "UNDER_REVIEW",
  "SELECTED",
  "DISPUTED",
];
const PENDING_ITEM: CreditItemLifecycleStatus[] = [
  "IDENTIFIED",
  "UNDER_REVIEW",
  "SELECTED",
];
const BUREAUS: CreditBureau[] = ["EXPERIAN", "EQUIFAX", "TRANSUNION"];
const OPEN_ROUND: RoundStatus[] = [
  "DRAFT",
  "PREPARING",
  "SENT",
  "WAITING_UPDATE",
  "REVIEWING",
];

const ROUND_SELECT = {
  id: true,
  roundNumber: true,
  status: true,
  sentAt: true,
  expectedReviewAt: true,
  reviewedAt: true,
  disputedItemsCount: true,
} as const;

function mapServiceStatusToCaseState(
  status: "OPEN" | "ON_HOLD" | "COMPLETED" | "CANCELED",
): CaseState {
  switch (status) {
    case "OPEN":
      return "OPEN";
    case "ON_HOLD":
      return "PAUSED";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELED":
      return "CANCELLED";
  }
}

function pickActiveService(
  services: ActiveServiceView[],
  preferredId?: string | null,
): ActiveServiceView | null {
  if (services.length === 0) return null;
  if (preferredId) {
    const preferred = services.find(
      (s) =>
        s.serviceCaseId === preferredId || s.creditCaseId === preferredId,
    );
    if (preferred) return preferred;
  }
  return services.find((s) => s.state === "OPEN") ?? services[0] ?? null;
}

function buildBureauProgress(
  current: BureauScoreCurrent[],
  history: CaseCreditOverview["history"],
): BureauProgress[] {
  return BUREAUS.map((bureau) => {
    const cur = current.find((c) => c.bureau === bureau);
    let initial: number | null = null;
    for (const row of history) {
      const score = row.scores[bureau];
      if (score != null) {
        initial = score;
        break;
      }
    }
    const latest = cur?.score ?? null;
    return {
      bureau,
      initial,
      current: latest,
      deltaFromInitial:
        latest != null && initial != null ? latest - initial : null,
      previousScore: cur?.previousScore ?? null,
      deltaFromPrevious: cur?.delta ?? null,
      reportDate: cur?.reportDate ?? null,
    };
  });
}

function emptyOutcome(): OutcomeSummary {
  return { deleted: 0, updated: 0, verified: 0, other: 0 };
}

function tallyOutcomes(
  rows: { outcome: DisputeOutcome | null }[],
): OutcomeSummary {
  const out = emptyOutcome();
  for (const row of rows) {
    if (!row.outcome) continue;
    if (row.outcome === "DELETED") out.deleted += 1;
    else if (row.outcome === "UPDATED") out.updated += 1;
    else if (row.outcome === "VERIFIED") out.verified += 1;
    else out.other += 1;
  }
  return out;
}

export async function getClientOverview(
  ctx: OrganizationContext,
  clientId: string,
  options?: { caseId?: string | null },
): Promise<ClientOverviewResult> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
    select: {
      id: true,
      clientCode: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      source: true,
      leadChannel: true,
      status: true,
      assignedToId: true,
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  const canViewCases = can(ctx.role, "cases.view");
  const canViewCredit = can(ctx.role, "creditReports.view");
  const canViewPayments = can(ctx.role, "payments.view");

  const serviceRows = canViewCases
    ? await prisma.serviceCase.findMany({
        where: { clientId, organizationId: ctx.organizationId },
        select: {
          id: true,
          caseNumber: true,
          status: true,
          nextActionAt: true,
          startedAt: true,
          stage: { select: { id: true, name: true, color: true } },
          service: { select: { code: true, name: true } },
          creditCase: {
            select: {
              id: true,
              caseCode: true,
              state: true,
              nextReviewAt: true,
              stage: { select: { id: true, name: true, color: true } },
            },
          },
        },
        orderBy: { startedAt: "desc" },
        take: 20,
      })
    : [];

  const services: ActiveServiceView[] = serviceRows.map((sc) => {
    const code = sc.service.code ?? "SERVICE";
    const isCredit = code === "CREDIT_REPAIR";
    return {
      kind: code,
      creditCaseId: sc.creditCase?.id ?? null,
      serviceCaseId: sc.id,
      label: sc.service.name,
      caseCode: sc.creditCase?.caseCode ?? sc.caseNumber,
      state: isCredit
        ? (sc.creditCase?.state ?? mapServiceStatusToCaseState(sc.status))
        : mapServiceStatusToCaseState(sc.status),
      stage: sc.stage ?? sc.creditCase?.stage ?? null,
      nextActionAt: sc.nextActionAt ?? sc.creditCase?.nextReviewAt ?? null,
    };
  });

  const activeService = pickActiveService(services, options?.caseId);
  const isCreditRepair = activeService?.kind === "CREDIT_REPAIR";
  const creditCaseId = activeService?.creditCaseId ?? null;
  const serviceCaseId = activeService?.serviceCaseId ?? null;

  // CL-003: métricas de operación scoped al servicio activo (no mezclar expedientes).
  const paymentScope = activeService
    ? creditCaseId
      ? { organizationId: ctx.organizationId, clientId, caseId: creditCaseId }
      : {
          organizationId: ctx.organizationId,
          clientId,
          serviceCaseId: serviceCaseId!,
        }
    : { organizationId: ctx.organizationId, clientId };
  const openTaskStatuses: Array<"PENDING" | "IN_PROGRESS"> = [
    "PENDING",
    "IN_PROGRESS",
  ];
  const taskScope = activeService
    ? {
        organizationId: ctx.organizationId,
        status: { in: openTaskStatuses },
        OR: [
          ...(creditCaseId ? [{ caseId: creditCaseId }] : []),
          ...(serviceCaseId ? [{ serviceCaseId }] : []),
        ],
      }
    : {
        organizationId: ctx.organizationId,
        clientId,
        status: { in: openTaskStatuses },
      };

  const [
    activityRows,
    documents,
    openTasks,
    paymentAggs,
    latestQuote,
    recentPayments,
  ] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        clientId,
        organizationId: ctx.organizationId,
        ...(activeService
          ? {
              OR: [
                ...(creditCaseId ? [{ caseId: creditCaseId }] : []),
                ...(serviceCaseId ? [{ serviceCaseId }] : []),
              ],
            }
          : {}),
      },
      select: {
        id: true,
        type: true,
        description: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.document.count({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        deletedAt: null,
        ...(activeService
          ? {
              OR: [
                ...(creditCaseId ? [{ caseId: creditCaseId }] : []),
                ...(serviceCaseId ? [{ serviceCaseId }] : []),
                // Docs solo de cliente (sin caso) visibles en todos los servicios.
                { caseId: null, serviceCaseId: null },
              ],
            }
          : {}),
      },
    }),
    prisma.task.count({ where: taskScope }),
    prisma.payment.groupBy({
      by: ["status"],
      where: paymentScope,
      _sum: { amount: true },
    }),
    prisma.quote.findFirst({
      where: {
        organizationId: ctx.organizationId,
        clientId,
        ...(creditCaseId
          ? { caseId: creditCaseId }
          : serviceCaseId
            ? { serviceCaseId }
            : {}),
        status: { in: ["ACCEPTED", "PAID", "SENT", "PARTIAL"] },
      },
      orderBy: { issuedAt: "desc" },
      select: { id: true, folio: true, total: true, currency: true, status: true },
    }),
    canViewPayments
      ? prisma.payment.findMany({
          where: paymentScope,
          orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
          take: 5,
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            receivedAt: true,
            dueAt: true,
            reference: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const lastActivityRow = activityRows[0] ?? null;
  const lastActivity = lastActivityRow
    ? {
        id: lastActivityRow.id,
        type: lastActivityRow.type,
        description: lastActivityRow.description,
        createdAt: lastActivityRow.createdAt,
        actorName: lastActivityRow.actor?.name ?? null,
      }
    : null;

  const latestActivities = activityRows.map((a) => ({
    id: a.id,
    type: a.type,
    description: a.description,
    createdAt: a.createdAt,
  }));

  const pendingPaymentsTotal = Number(
    paymentAggs.find((p) => p.status === "PENDING")?._sum.amount ?? 0,
  );
  const receivedPaymentsTotal = Number(
    paymentAggs.find((p) => p.status === "RECEIVED")?._sum.amount ?? 0,
  );
  const quoteTotal = latestQuote ? Number(latestQuote.total.toString()) : null;
  const currency = latestQuote?.currency ?? "USD";

  const paymentsSummary = {
    quoteTotal,
    received: receivedPaymentsTotal,
    pending: pendingPaymentsTotal,
    currency,
    recent: recentPayments.map((p) => ({
      id: p.id,
      amount: p.amount.toString(),
      method: p.method,
      status: p.status,
      receivedAt: p.receivedAt,
      dueAt: p.dueAt,
      reference: p.reference,
    })),
    payableQuote:
      latestQuote &&
      ["SENT", "ACCEPTED", "PARTIAL"].includes(latestQuote.status)
        ? {
            id: latestQuote.id,
            folio: latestQuote.folio,
            status: latestQuote.status,
          }
        : null,
  };

  const baseCounts: ClientOverviewCounts = {
    itemsActive: 0,
    itemsResolved: 0,
    itemsPending: 0,
    itemsNegative: 0,
    documents,
    openTasks,
    pendingPaymentsTotal,
    receivedPaymentsTotal,
    quoteTotal,
    currency,
  };

  const nextAction = activeService
    ? {
        at: activeService.nextActionAt,
        label: activeService.nextActionAt
          ? "Revisar expediente"
          : "Sin fecha programada",
      }
    : null;

  if (!activeService) {
    return {
      client,
      services,
      activeService: null,
      nextAction: null,
      lastActivity,
      latestActivities,
      documentsSummary: { count: documents },
      tasksSummary: { openCount: openTasks },
      paymentsSummary,
      credit: null,
    };
  }

  // Otras verticales: métricas de servicio sin chrome de burós/rondas.
  if (!isCreditRepair || !creditCaseId) {
    return {
      client,
      services,
      activeService,
      nextAction,
      lastActivity,
      latestActivities,
      documentsSummary: { count: documents },
      tasksSummary: { openCount: openTasks },
      paymentsSummary,
      credit: null,
    };
  }

  const caseId = creditCaseId;

  const [roundsSummary, roundsTotal, itemGroups, disputeOutcomes] =
    await Promise.all([
      prisma.creditRound.findMany({
        where: { organizationId: ctx.organizationId, caseId },
        orderBy: { roundNumber: "asc" },
        take: 10,
        select: ROUND_SELECT,
      }),
      prisma.creditRound.count({
        where: { organizationId: ctx.organizationId, caseId },
      }),
      prisma.creditItem.groupBy({
        by: ["lifecycleStatus"],
        where: { organizationId: ctx.organizationId, caseId },
        _count: { _all: true },
      }),
      prisma.disputeItem.findMany({
        where: {
          organizationId: ctx.organizationId,
          outcome: { not: null },
          round: { caseId },
        },
        select: { outcome: true },
        take: 500,
      }),
    ]);

  let creditOverview: CaseCreditOverview | null = null;
  if (canViewCredit) {
    creditOverview = await getCaseCreditOverview(ctx, caseId);
  }

  const lifecycleCounts = new Map(
    itemGroups.map((g) => [g.lifecycleStatus, g._count._all]),
  );
  const itemsActive = ACTIVE_ITEM.reduce(
    (acc, s) => acc + (lifecycleCounts.get(s) ?? 0),
    0,
  );
  const itemsPending = PENDING_ITEM.reduce(
    (acc, s) => acc + (lifecycleCounts.get(s) ?? 0),
    0,
  );
  const itemsResolved = lifecycleCounts.get("RESOLVED") ?? 0;
  const itemsNegative = creditOverview?.negativeItemCount ?? 0;

  const openRound =
    [...roundsSummary].reverse().find((r) => OPEN_ROUND.includes(r.status)) ??
    null;
  const currentRound =
    openRound ??
    (roundsSummary.length > 0
      ? roundsSummary[roundsSummary.length - 1]!
      : null);

  const bureaus = creditOverview
    ? buildBureauProgress(creditOverview.current, creditOverview.history)
    : [];
  const scoreHistory: ScoreHistoryPointDto[] =
    creditOverview?.history.map((h) => ({
      reportId: h.reportId,
      label: h.label,
      reportDate: h.reportDate,
      scores: h.scores,
    })) ?? [];
  const scoredHistory = scoreHistory.filter((h) =>
    Object.values(h.scores).some((s) => s != null),
  );

  if (currentRound && nextAction) {
    nextAction.label =
      currentRound.status === "WAITING_UPDATE" ||
      currentRound.status === "SENT"
        ? `Revisar ronda #${currentRound.roundNumber}`
        : currentRound.status === "PREPARING" || currentRound.status === "DRAFT"
          ? `Continuar ronda #${currentRound.roundNumber}`
          : nextAction.label;
  }

  return {
    client,
    services,
    activeService,
    nextAction,
    lastActivity,
    latestActivities,
    documentsSummary: { count: documents },
    tasksSummary: { openCount: openTasks },
    paymentsSummary,
    credit: {
      canView: canViewCredit,
      overview: creditOverview
        ? { current: creditOverview.current, history: creditOverview.history }
        : null,
      bureaus,
      scoreHistory,
      reportCount: scoreHistory.length,
      hasChartData: scoredHistory.length >= 2,
      round: currentRound,
      roundsSummary,
      roundsTotal,
      currentRoundId: currentRound?.id ?? null,
      itemsSummary: {
        active: itemsActive,
        pending: itemsPending,
        resolved: itemsResolved,
        negative: itemsNegative,
      },
      outcomeSummary: tallyOutcomes(disputeOutcomes),
      counts: {
        ...baseCounts,
        itemsActive,
        itemsResolved,
        itemsPending,
        itemsNegative,
      },
    },
  };
}
