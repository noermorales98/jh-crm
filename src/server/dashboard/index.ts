import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { zonedDayRange } from "@/src/lib/format/dates";
import type { OrganizationContext } from "@/src/server/auth/guards";

/**
 * Dashboard operativo: queries agregadas pequeñas en paralelo.
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

  const [
    activeClients,
    openCases,
    casesWaitingUpdate,
    activeRounds,
    tasksToday,
    overdueTasks,
    upcomingCaseReviews,
    upcomingRoundReviews,
    pendingQuotes,
    pendingPaymentsAgg,
    pendingPayments,
    recentReceivedPayments,
  ] = await Promise.all([
    prisma.client.count({
      where: { organizationId: orgId, status: "ACTIVE" },
    }),
    prisma.creditCase.count({
      where: { organizationId: orgId, state: "OPEN" },
    }),
    // Casos esperando actualización: revisión vencida o dentro de 7 días.
    prisma.creditCase.findMany({
      where: {
        organizationId: orgId,
        state: "OPEN",
        nextReviewAt: { lte: in7Days },
      },
      select: {
        id: true,
        caseCode: true,
        nextReviewAt: true,
        client: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { nextReviewAt: "asc" },
      take: 10,
    }),
    prisma.creditRound.count({
      where: { organizationId: orgId, status: { in: ["SENT", "WAITING_UPDATE", "REVIEWING"] } },
    }),
    prisma.task.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        dueAt: { gte: today.start, lt: today.end },
      },
      select: {
        id: true, title: true, type: true, priority: true, dueAt: true,
        client: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
    prisma.task.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        dueAt: { lt: now },
      },
      select: {
        id: true, title: true, type: true, priority: true, dueAt: true,
        client: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
    prisma.creditCase.findMany({
      where: {
        organizationId: orgId,
        state: "OPEN",
        nextReviewAt: { gte: now, lte: in14Days },
      },
      select: {
        id: true,
        caseCode: true,
        nextReviewAt: true,
        client: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { nextReviewAt: "asc" },
      take: 10,
    }),
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
            client: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { expectedReviewAt: "asc" },
      take: 10,
    }),
    prisma.quote.count({
      where: { organizationId: orgId, status: "SENT" },
    }),
    prisma.payment.aggregate({
      where: { organizationId: orgId, status: "PENDING" },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.payment.findMany({
      where: { organizationId: orgId, status: "PENDING" },
      select: {
        id: true, amount: true, currency: true, dueAt: true, method: true,
        client: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
    prisma.payment.findMany({
      where: {
        organizationId: orgId,
        status: "RECEIVED",
        receivedAt: { gte: sevenDaysAgo },
      },
      select: {
        id: true, amount: true, currency: true, method: true, receivedAt: true,
        client: { select: { id: true, firstName: true, lastName: true } },
        receipt: { select: { id: true, folio: true } },
      },
      orderBy: { receivedAt: "desc" },
      take: 10,
    }),
  ]);

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
        count: casesWaitingUpdate.length,
        items: casesWaitingUpdate,
        link: `/crm/casos?state=OPEN&reviewTo=${in7Days.toISOString().slice(0, 10)}`,
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
        cases: upcomingCaseReviews,
        rounds: upcomingRoundReviews,
        count: upcomingCaseReviews.length + upcomingRoundReviews.length,
        link: "/crm/rondas",
      },
      pendingQuotes: {
        count: pendingQuotes,
        link: "/crm/cotizaciones?status=SENT",
      },
      pendingPayments: {
        count: pendingPaymentsAgg._count,
        totalAmount: (pendingPaymentsAgg._sum.amount ?? new Prisma.Decimal(0)).toDecimalPlaces(2).toString(),
        items: pendingPayments,
        link: "/crm/pagos?status=PENDING",
      },
      recentReceivedPayments: {
        count: recentReceivedPayments.length,
        items: recentReceivedPayments,
        link: "/crm/pagos?status=RECEIVED",
      },
    },
  };
}
