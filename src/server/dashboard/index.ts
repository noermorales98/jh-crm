import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { zonedDayRange } from "@/src/lib/format/dates";
import type { OrganizationContext } from "@/src/server/auth/guards";

/** Hostinger: evita abrir demasiadas queries concurrentes en un solo request. */
async function runBatched(
  factories: Array<() => Promise<unknown>>,
  batchSize = 5,
): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < factories.length; i += batchSize) {
    const slice = factories.slice(i, i + batchSize);
    const batch = await Promise.all(slice.map((fn) => fn()));
    out.push(...batch);
  }
  return out;
}

/**
 * Dashboard operativo: queries agregadas en lotes (no un solo Promise.all masivo).
 * Cada widget incluye los datos mínimos y los query params para enlazar
 * a su lista filtrada.
 */
export async function getDashboardSummary(ctx: OrganizationContext) {
  const orgId = ctx.organizationId;
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: orgId },
    select: { timezone: true },
  });
  const timezone = settings?.timezone ?? "America/Chicago";
  const now = new Date();
  const today = zonedDayRange(now, timezone);
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    activeClients,
    openCases,
    casesWaitingUpdate,
    activeRounds,
    tasksToday,
    overdueTasks,
    upcomingCaseActions,
    upcomingRoundReviews,
    pendingQuotes,
    pendingPaymentsAgg,
    pendingPayments,
    recentReceivedPayments,
    unreadInboxCount,
    unreadInboxMails,
    documentsPendingCases,
    documentsPendingList,
    reportsToReview,
    roundsToPrepare,
    roundsWaitingUpdate,
    overdueUpdates,
    overdueUpdatesList,
    overduePayments,
    overduePaymentsList,
    newLeads,
    conversions,
    disputedItems,
    deletedItems,
    updatedItems,
    leadsToContact,
  ] = (await runBatched([
    () =>
      prisma.client.count({
        where: { organizationId: orgId, status: "ACTIVE" },
      }),
    () =>
      prisma.serviceCase.count({
        where: { organizationId: orgId, status: "OPEN" },
      }),
    // SC-003: acciones operativas vencidas o dentro de 7 días.
    () =>
      prisma.serviceCase.findMany({
        where: {
          organizationId: orgId,
          status: "OPEN",
          nextActionAt: { lte: in7Days },
        },
        select: {
          id: true,
          caseNumber: true,
          nextActionAt: true,
          creditCase: { select: { id: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { nextActionAt: "asc" },
        take: 10,
      }),
    () =>
      prisma.creditRound.count({
        where: {
          organizationId: orgId,
          status: { in: ["SENT", "WAITING_UPDATE", "REVIEWING"] },
        },
      }),
    () =>
      prisma.task.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          dueAt: { gte: today.start, lt: today.end },
        },
        select: {
          id: true,
          title: true,
          type: true,
          priority: true,
          dueAt: true,
          client: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
    () =>
      prisma.task.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          dueAt: { lt: now },
        },
        select: {
          id: true,
          title: true,
          type: true,
          priority: true,
          dueAt: true,
          client: { select: { id: true, firstName: true, lastName: true } },
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
    () =>
      prisma.serviceCase.findMany({
        where: {
          organizationId: orgId,
          status: "OPEN",
          nextActionAt: { gte: now, lte: in14Days },
        },
        select: {
          id: true,
          caseNumber: true,
          nextActionAt: true,
          creditCase: { select: { id: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { nextActionAt: "asc" },
        take: 10,
      }),
    () =>
      prisma.creditRound.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["SENT", "WAITING_UPDATE"] },
          expectedReviewAt: { lte: in14Days },
        },
        select: {
          id: true,
          roundNumber: true,
          expectedReviewAt: true,
          case: {
            select: {
              id: true,
              caseCode: true,
              client: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
        orderBy: { expectedReviewAt: "asc" },
        take: 10,
      }),
    () =>
      prisma.quote.count({
        where: { organizationId: orgId, status: "SENT" },
      }),
    () =>
      prisma.payment.aggregate({
        where: { organizationId: orgId, status: "PENDING" },
        _count: true,
        _sum: { amount: true },
      }),
    () =>
      prisma.payment.findMany({
        where: { organizationId: orgId, status: "PENDING" },
        select: {
          id: true,
          amount: true,
          currency: true,
          dueAt: true,
          method: true,
          client: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
    () =>
      prisma.payment.findMany({
        where: {
          organizationId: orgId,
          status: "RECEIVED",
          receivedAt: { gte: sevenDaysAgo },
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          method: true,
          receivedAt: true,
          client: { select: { id: true, firstName: true, lastName: true } },
          receipt: { select: { id: true, folio: true } },
        },
        orderBy: { receivedAt: "desc" },
        take: 10,
      }),
    () =>
      prisma.mailMessage.count({
        where: {
          organizationId: orgId,
          folder: "INBOX",
          direction: "INBOUND",
          isRead: false,
        },
      }),
    () =>
      prisma.mailMessage.findMany({
        where: {
          organizationId: orgId,
          folder: "INBOX",
          direction: "INBOUND",
          isRead: false,
        },
        select: {
          fromName: true,
          fromAddress: true,
          subject: true,
        },
        orderBy: { receivedAt: "desc" },
        take: 5,
      }),
    // —— Atención crédito ——
    () =>
      prisma.creditCase.count({
        where: {
          organizationId: orgId,
          state: "OPEN",
          stage: { key: "DOCUMENTS_PENDING" },
        },
      }),
    () =>
      prisma.creditCase.findMany({
        where: {
          organizationId: orgId,
          state: "OPEN",
          stage: { key: "DOCUMENTS_PENDING" },
        },
        select: {
          id: true,
          caseCode: true,
          client: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    () =>
      prisma.creditReport.count({
        where: {
          organizationId: orgId,
          type: "UPDATE",
          createdAt: { gte: fourteenDaysAgo },
        },
      }),
    () =>
      prisma.creditRound.count({
        where: {
          organizationId: orgId,
          status: { in: ["DRAFT", "PREPARING"] },
        },
      }),
    () =>
      prisma.creditRound.count({
        where: {
          organizationId: orgId,
          status: "WAITING_UPDATE",
        },
      }),
    () =>
      prisma.serviceCase.count({
        where: {
          organizationId: orgId,
          status: "OPEN",
          nextActionAt: { lt: now },
        },
      }),
    () =>
      prisma.serviceCase.findMany({
        where: {
          organizationId: orgId,
          status: "OPEN",
          nextActionAt: { lt: now },
        },
        select: {
          id: true,
          caseNumber: true,
          nextActionAt: true,
          creditCase: { select: { id: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { nextActionAt: "asc" },
        take: 5,
      }),
    () =>
      prisma.payment.count({
        where: {
          organizationId: orgId,
          status: "PENDING",
          dueAt: { lt: now },
        },
      }),
    () =>
      prisma.payment.findMany({
        where: {
          organizationId: orgId,
          status: "PENDING",
          dueAt: { lt: now },
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          dueAt: true,
          client: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { dueAt: "asc" },
        take: 5,
      }),
    () =>
      prisma.client.count({
        where: {
          organizationId: orgId,
          status: "LEAD",
          createdAt: { gte: sevenDaysAgo },
        },
      }),
    () =>
      prisma.opportunity.count({
        where: {
          organizationId: orgId,
          stage: "WON",
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),
    () =>
      prisma.disputeItem.count({
        where: {
          organizationId: orgId,
          status: { in: ["SENT", "WAITING", "RESPONDED"] },
        },
      }),
    () =>
      prisma.disputeItem.count({
        where: {
          organizationId: orgId,
          outcome: "DELETED",
        },
      }),
    () =>
      prisma.disputeItem.count({
        where: {
          organizationId: orgId,
          outcome: "UPDATED",
        },
      }),
    // LD-004 — Leads por contactar (nextFollowUpAt vencido o en 7 días).
    () =>
      prisma.opportunity.findMany({
        where: {
          organizationId: orgId,
          stage: { notIn: ["WON", "LOST"] },
          nextFollowUpAt: { not: null, lte: in7Days },
        },
        select: {
          id: true,
          nextFollowUpAt: true,
          stage: true,
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              clientCode: true,
            },
          },
          owner: { select: { id: true, name: true } },
        },
        orderBy: { nextFollowUpAt: "asc" },
        take: 15,
      }),
  ])) as [
    number,
    number,
    Array<{
      id: string;
      caseNumber: string;
      nextActionAt: Date | null;
      creditCase: { id: string } | null;
      client: { id: string; firstName: string; lastName: string | null };
    }>,
    number,
    Array<{
      id: string;
      title: string;
      type: string;
      priority: string;
      dueAt: Date | null;
      client: { id: string; firstName: string; lastName: string | null } | null;
    }>,
    Array<{
      id: string;
      title: string;
      type: string;
      priority: string;
      dueAt: Date | null;
      client: { id: string; firstName: string; lastName: string | null } | null;
      assignedTo: { id: string; name: string | null } | null;
    }>,
    Array<{
      id: string;
      caseNumber: string;
      nextActionAt: Date | null;
      creditCase: { id: string } | null;
      client: { id: string; firstName: string; lastName: string | null };
    }>,
    Array<{
      id: string;
      roundNumber: number;
      expectedReviewAt: Date | null;
      case: {
        id: string;
        caseCode: string;
        client: { id: string; firstName: string; lastName: string | null };
      };
    }>,
    number,
    { _count: number; _sum: { amount: Prisma.Decimal | null } },
    Array<{
      id: string;
      amount: Prisma.Decimal;
      currency: string;
      dueAt: Date | null;
      method: string;
      client: { id: string; firstName: string; lastName: string | null };
    }>,
    Array<{
      id: string;
      amount: Prisma.Decimal;
      currency: string;
      method: string;
      receivedAt: Date | null;
      client: { id: string; firstName: string; lastName: string | null };
      receipt: { id: string; folio: string } | null;
    }>,
    number,
    Array<{
      fromName: string | null;
      fromAddress: string;
      subject: string;
    }>,
    number,
    Array<{
      id: string;
      caseCode: string;
      client: { id: string; firstName: string; lastName: string | null };
    }>,
    number,
    number,
    number,
    number,
    Array<{
      id: string;
      caseNumber: string;
      nextActionAt: Date | null;
      creditCase: { id: string } | null;
      client: { id: string; firstName: string; lastName: string | null };
    }>,
    number,
    Array<{
      id: string;
      amount: Prisma.Decimal;
      currency: string;
      dueAt: Date | null;
      client: { id: string; firstName: string; lastName: string | null };
    }>,
    number,
    number,
    number,
    number,
    number,
    Array<{
      id: string;
      nextFollowUpAt: Date | null;
      stage: string;
      client: {
        id: string;
        firstName: string;
        lastName: string | null;
        clientCode: string;
      };
      owner: { id: string; name: string | null } | null;
    }>,
  ];

  const leadsToContactItems = leadsToContact.map((row) => ({
    ...row,
    overdue:
      row.nextFollowUpAt != null && row.nextFollowUpAt.getTime() < now.getTime(),
  }));
  const leadsToContactOverdue = leadsToContactItems.filter((r) => r.overdue)
    .length;
  const toNextActionItem = (row: (typeof casesWaitingUpdate)[number]) => ({
    serviceCaseId: row.id,
    caseId: row.creditCase?.id ?? null,
    caseNumber: row.caseNumber,
    nextActionAt: row.nextActionAt,
    client: row.client,
  });
  const casesWaitingUpdateItems = casesWaitingUpdate.map(toNextActionItem);
  const upcomingCaseActionItems = upcomingCaseActions.map(toNextActionItem);
  const overdueUpdateItems = overdueUpdatesList.map(toNextActionItem);
  return {
    generatedAt: now,
    timezone,
    widgets: {
      activeClients: {
        count: activeClients,
        link: "/crm/clientes?status=ACTIVE",
      },
      openCases: {
        count: openCases,
        link: "/crm/casos?state=OPEN",
      },
      casesWaitingUpdate: {
        count: casesWaitingUpdateItems.length,
        items: casesWaitingUpdateItems,
        link: "/crm/casos?state=OPEN",
      },
      activeRounds: {
        count: activeRounds,
        link: "/crm/rondas",
      },
      tasksToday: {
        count: tasksToday.length,
        items: tasksToday,
        link: "/crm/tareas?due=today",
      },
      overdueTasks: {
        count: overdueTasks.length,
        items: overdueTasks,
        link: "/crm/tareas?due=overdue",
      },
      upcomingReviews: {
        cases: upcomingCaseActionItems,
        rounds: upcomingRoundReviews,
        count: upcomingCaseActionItems.length + upcomingRoundReviews.length,
        link: "/crm/rondas",
      },
      pendingQuotes: {
        count: pendingQuotes,
        link: "/crm/cotizaciones?status=SENT",
      },
      pendingPayments: {
        count: pendingPaymentsAgg._count,
        totalAmount: (
          pendingPaymentsAgg._sum.amount ?? new Prisma.Decimal(0)
        )
          .toDecimalPlaces(2)
          .toString(),
        items: pendingPayments,
        link: "/crm/pagos?status=PENDING",
      },
      recentReceivedPayments: {
        count: recentReceivedPayments.length,
        items: recentReceivedPayments,
        link: "/crm/pagos?status=RECEIVED",
      },
      unreadMails: {
        count: unreadInboxCount,
        items: unreadInboxMails.map((mail) => ({
          from: mail.fromName || mail.fromAddress,
          subject: mail.subject,
        })),
        link: "/crm/mails?folder=inbox",
      },
      /** Atención crédito / operación */
      documentsPendingCases: {
        count: documentsPendingCases,
        items: documentsPendingList,
        link: "/crm/casos?state=OPEN",
      },
      reportsToReview: {
        count: reportsToReview,
        link: "/crm/casos",
      },
      roundsToPrepare: {
        count: roundsToPrepare,
        link: "/crm/rondas",
      },
      roundsWaitingUpdate: {
        count: roundsWaitingUpdate,
        link: "/crm/rondas",
      },
      overdueUpdates: {
        count: overdueUpdates,
        items: overdueUpdateItems,
        link: "/crm/casos?state=OPEN",
      },
      overduePayments: {
        count: overduePayments,
        items: overduePaymentsList,
        link: "/crm/pagos?status=PENDING",
      },
      newLeads: {
        count: newLeads,
        link: "/crm/clientes?status=LEAD",
      },
      leadsToContact: {
        count: leadsToContactItems.length,
        overdueCount: leadsToContactOverdue,
        items: leadsToContactItems,
        link: "/crm/oportunidades",
      },
      conversions: {
        count: conversions,
        link: "/crm/clientes?status=ACTIVE",
      },
      disputedItems: {
        count: disputedItems,
        link: "/crm/rondas",
      },
      deletedItems: {
        count: deletedItems,
        link: "/crm/rondas",
      },
      updatedItems: {
        count: updatedItems,
        link: "/crm/rondas",
      },
    },
  };
}
