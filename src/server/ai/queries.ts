import { prisma } from "@/src/lib/db";
import { formatMoney } from "@/src/lib/format";
import { CRM_ROUTES, HOW_TO_GUIDE } from "@/src/lib/ai/knowledge";
import { fullName, jsonSafe } from "@/src/lib/ai/serialize";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { getSettings } from "@/src/server/config";
import { getDashboardSummary } from "@/src/server/dashboard";
import { DomainError } from "@/src/server/errors";
import * as clientService from "@/src/server/clients";
import * as caseService from "@/src/server/cases";
import * as serviceCatalog from "@/src/server/services";

const SEARCH_LIMIT = 8;

function contains(q: string) {
  return { contains: q };
}

function deny(action: string) {
  return { error: `No tienes permiso para ${action}.` };
}

export async function getCompanySnapshot(ctx: OrganizationContext) {
  const [org, settings] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    }),
    getSettings(ctx),
  ]);
  const address = [
    settings.addressLine1,
    settings.addressLine2,
    [settings.city, settings.state, settings.postalCode].filter(Boolean).join(", "),
    settings.country,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    organizationName: org?.name ?? "J&H Multiservices LLC",
    legalName: settings.legalName,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    address: address || null,
    timezone: settings.timezone,
    currency: settings.currency,
    defaultTaxRate: settings.defaultTaxRate.toString(),
    quotePrefix: settings.quotePrefix,
    receiptPrefix: settings.receiptPrefix,
    clientPrefix: settings.clientPrefix,
    casePrefix: settings.casePrefix,
    defaultTerms: settings.defaultTerms,
    callmebotEnabled: settings.callmebotEnabled,
    href: "/crm/configuracion",
  };
}

export async function getDashboardSnapshot(ctx: OrganizationContext) {
  if (!can(ctx.role, "dashboard.view")) return deny("ver el dashboard");
  const summary = await getDashboardSummary(ctx);
  const w = summary.widgets;
  return jsonSafe({
    generatedAt: summary.generatedAt,
    timezone: summary.timezone,
    counts: {
      activeClients: w.activeClients.count,
      openCases: w.openCases.count,
      casesWaitingUpdate: w.casesWaitingUpdate.count,
      activeRounds: w.activeRounds.count,
      tasksToday: w.tasksToday.count,
      overdueTasks: w.overdueTasks.count,
      upcomingReviews: w.upcomingReviews.count,
      pendingQuotes: w.pendingQuotes.count,
      pendingPayments: w.pendingPayments.count,
      pendingPaymentsTotal: w.pendingPayments.totalAmount,
      recentReceivedPayments: w.recentReceivedPayments.count,
    },
    overdueTasks: w.overdueTasks.items.map((task) => ({
      title: task.title,
      dueAt: task.dueAt,
      client: task.client ? fullName(task.client) : null,
      href: "/crm/tareas?due=overdue",
    })),
    casesWaitingUpdate: w.casesWaitingUpdate.items.map((creditCase) => ({
      caseCode: creditCase.caseCode,
      nextReviewAt: creditCase.nextReviewAt,
      client: fullName(creditCase.client),
      href: `/crm/casos/${creditCase.id}`,
    })),
    pendingPayments: w.pendingPayments.items.map((payment) => ({
      amount: formatMoney(payment.amount, payment.currency),
      dueAt: payment.dueAt,
      method: payment.method,
      client: fullName(payment.client),
      href: "/crm/pagos?status=PENDING",
    })),
    links: {
      dashboard: "/crm/dashboard",
      clients: w.activeClients.link,
      cases: w.openCases.link,
      tasksOverdue: w.overdueTasks.link,
      paymentsPending: w.pendingPayments.link,
      quotes: w.pendingQuotes.link,
      rounds: w.activeRounds.link,
    },
  });
}

export async function searchCrm(ctx: OrganizationContext, rawQuery: string) {
  const q = rawQuery.trim();
  if (q.length < 2) {
    return { error: "Escribe al menos 2 caracteres para buscar." };
  }

  const orgId = ctx.organizationId;
  const [clients, cases, quotes, payments, tasks, rounds, receipts] =
    await Promise.all([
      can(ctx.role, "clients.view")
        ? prisma.client.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { firstName: contains(q) },
                { lastName: contains(q) },
                { email: contains(q) },
                { phone: contains(q) },
                { clientCode: contains(q) },
              ],
            },
            select: {
              id: true,
              clientCode: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              status: true,
            },
            take: SEARCH_LIMIT,
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve(null),
      can(ctx.role, "cases.view")
        ? prisma.creditCase.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { caseCode: contains(q) },
                { summary: contains(q) },
                { client: { firstName: contains(q) } },
                { client: { lastName: contains(q) } },
                { client: { clientCode: contains(q) } },
              ],
            },
            select: {
              id: true,
              caseCode: true,
              state: true,
              nextReviewAt: true,
              stage: { select: { name: true } },
              client: {
                select: { id: true, firstName: true, lastName: true, clientCode: true },
              },
            },
            take: SEARCH_LIMIT,
            orderBy: { openedAt: "desc" },
          })
        : Promise.resolve(null),
      can(ctx.role, "quotes.view")
        ? prisma.quote.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { folio: contains(q) },
                { client: { firstName: contains(q) } },
                { client: { lastName: contains(q) } },
                { client: { clientCode: contains(q) } },
              ],
            },
            select: {
              id: true,
              folio: true,
              status: true,
              total: true,
              currency: true,
              client: { select: { id: true, firstName: true, lastName: true } },
            },
            take: SEARCH_LIMIT,
            orderBy: { issuedAt: "desc" },
          })
        : Promise.resolve(null),
      can(ctx.role, "payments.view")
        ? prisma.payment.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { reference: contains(q) },
                { client: { firstName: contains(q) } },
                { client: { lastName: contains(q) } },
                { quote: { folio: contains(q) } },
              ],
            },
            select: {
              id: true,
              amount: true,
              currency: true,
              status: true,
              method: true,
              dueAt: true,
              client: { select: { id: true, firstName: true, lastName: true } },
              quote: { select: { folio: true } },
            },
            take: SEARCH_LIMIT,
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve(null),
      can(ctx.role, "tasks.view")
        ? prisma.task.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { title: contains(q) },
                { description: contains(q) },
                { client: { firstName: contains(q) } },
                { client: { lastName: contains(q) } },
              ],
            },
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              dueAt: true,
              client: { select: { firstName: true, lastName: true } },
              case: { select: { id: true, caseCode: true } },
            },
            take: SEARCH_LIMIT,
            orderBy: { dueAt: "asc" },
          })
        : Promise.resolve(null),
      can(ctx.role, "rounds.view")
        ? prisma.creditRound.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { notes: contains(q) },
                { case: { caseCode: contains(q) } },
                { case: { client: { firstName: contains(q) } } },
                { case: { client: { lastName: contains(q) } } },
              ],
            },
            select: {
              id: true,
              roundNumber: true,
              status: true,
              expectedReviewAt: true,
              case: {
                select: {
                  id: true,
                  caseCode: true,
                  client: { select: { firstName: true, lastName: true } },
                },
              },
            },
            take: SEARCH_LIMIT,
            orderBy: { expectedReviewAt: "asc" },
          })
        : Promise.resolve(null),
      can(ctx.role, "receipts.view")
        ? prisma.receipt.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { folio: contains(q) },
                { client: { firstName: contains(q) } },
                { client: { lastName: contains(q) } },
              ],
            },
            select: {
              id: true,
              folio: true,
              status: true,
              amount: true,
              currency: true,
              client: { select: { firstName: true, lastName: true } },
            },
            take: SEARCH_LIMIT,
            orderBy: { issuedAt: "desc" },
          })
        : Promise.resolve(null),
    ]);

  return jsonSafe({
    query: q,
    clients: clients?.map((row) => ({
      ...row,
      name: fullName(row),
      href: `/crm/clientes/${row.id}`,
      expedienteHref: `/crm/clientes/${row.id}/expediente`,
    })),
    cases: cases?.map((row) => ({
      id: row.id,
      caseCode: row.caseCode,
      state: row.state,
      stage: row.stage.name,
      nextReviewAt: row.nextReviewAt,
      client: fullName(row.client),
      href: `/crm/casos/${row.id}`,
      clientHref: `/crm/clientes/${row.client.id}`,
    })),
    quotes: quotes?.map((row) => ({
      id: row.id,
      folio: row.folio,
      status: row.status,
      total: formatMoney(row.total, row.currency),
      client: fullName(row.client),
      href: `/crm/cotizaciones/${row.id}`,
    })),
    payments: payments?.map((row) => ({
      id: row.id,
      amount: formatMoney(row.amount, row.currency),
      status: row.status,
      method: row.method,
      dueAt: row.dueAt,
      client: fullName(row.client),
      quote: row.quote?.folio ?? null,
      href: "/crm/pagos",
    })),
    tasks: tasks?.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      dueAt: row.dueAt,
      client: row.client ? fullName(row.client) : null,
      caseCode: row.case?.caseCode ?? null,
      href: row.case ? `/crm/casos/${row.case.id}/tareas` : "/crm/tareas",
    })),
    rounds: rounds?.map((row) => ({
      id: row.id,
      roundNumber: row.roundNumber,
      status: row.status,
      expectedReviewAt: row.expectedReviewAt,
      caseCode: row.case.caseCode,
      client: fullName(row.case.client),
      href: `/crm/casos/${row.case.id}/rondas`,
    })),
    receipts: receipts?.map((row) => ({
      id: row.id,
      folio: row.folio,
      status: row.status,
      amount: formatMoney(row.amount, row.currency),
      client: fullName(row.client),
      href: "/crm/recibos",
    })),
  });
}

export async function getClientBrief(ctx: OrganizationContext, clientId: string) {
  if (!can(ctx.role, "clients.view")) return deny("ver clientes");
  try {
    const detail = await clientService.getClientDetail(ctx, clientId);
    const canSeeSensitiveMeta = can(ctx.role, "sensitive.view");
    const documents = detail.documents.map((doc) => {
      const hideName =
        !canSeeSensitiveMeta && doc.sensitivity === "HIGHLY_SENSITIVE";
      return {
        id: doc.id,
        category: doc.category,
        sensitivity: doc.sensitivity,
        name: hideName ? "[documento sensible]" : (doc.displayName ?? doc.originalName),
        createdAt: doc.createdAt,
      };
    });
    return jsonSafe({
      client: {
        ...detail.client,
        name: fullName(detail.client),
        href: `/crm/clientes/${detail.client.id}`,
        expedienteHref: `/crm/clientes/${detail.client.id}/expediente`,
        casosHref: `/crm/clientes/${detail.client.id}/casos`,
        actividadHref: `/crm/clientes/${detail.client.id}/actividad`,
      },
      cases: detail.cases.map((row) => ({
        ...row,
        href: `/crm/casos/${row.id}`,
      })),
      openTasks: detail.openTasks.map((row) => ({
        ...row,
        href: "/crm/tareas",
      })),
      recentQuotes: detail.recentQuotes.map((row) => ({
        id: row.id,
        folio: row.folio,
        status: row.status,
        total: formatMoney(row.total, row.currency),
        issuedAt: row.issuedAt,
        href: `/crm/cotizaciones/${row.id}`,
      })),
      recentPayments: detail.recentPayments.map((row) => ({
        id: row.id,
        amount: formatMoney(row.amount, row.currency),
        status: row.status,
        method: row.method,
        dueAt: row.dueAt,
        receivedAt: row.receivedAt,
        href: "/crm/pagos",
      })),
      documents,
      timeline: detail.timeline.slice(0, 12),
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function getCaseBrief(ctx: OrganizationContext, caseId: string) {
  if (!can(ctx.role, "cases.view")) return deny("ver casos");
  try {
    const detail = await caseService.getCaseDetail(ctx, caseId);
    const canSeeSensitiveMeta = can(ctx.role, "sensitive.view");
    return jsonSafe({
      case: {
        ...detail.case,
        href: `/crm/casos/${caseId}`,
        rondasHref: `/crm/casos/${caseId}/rondas`,
        tareasHref: `/crm/casos/${caseId}/tareas`,
        documentosHref: `/crm/casos/${caseId}/documentos`,
        cotizacionesHref: `/crm/casos/${caseId}/cotizaciones`,
        pagosHref: `/crm/casos/${caseId}/pagos`,
        clientHref: `/crm/clientes/${detail.case.client.id}`,
      },
      rounds: detail.rounds.map((row) => ({
        id: row.id,
        roundNumber: row.roundNumber,
        status: row.status,
        expectedReviewAt: row.expectedReviewAt,
      })),
      openTasks: detail.openTasks,
      documents: detail.documents.map((doc) => ({
        id: doc.id,
        category: doc.category,
        sensitivity: doc.sensitivity,
        name:
          !canSeeSensitiveMeta && doc.sensitivity === "HIGHLY_SENSITIVE"
            ? "[documento sensible]"
            : (doc.displayName ?? doc.originalName),
      })),
      quotes: detail.quotes.map((row) => ({
        id: row.id,
        folio: row.folio,
        status: row.status,
        total: formatMoney(row.total, row.currency),
        href: `/crm/cotizaciones/${row.id}`,
      })),
      payments: detail.payments.map((row) => ({
        id: row.id,
        amount: formatMoney(row.amount, row.currency),
        status: row.status,
        method: row.method,
        href: `/crm/casos/${caseId}/pagos`,
      })),
      timeline: detail.timeline.slice(0, 12),
    });
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function getCatalogSnapshot(ctx: OrganizationContext) {
  if (!can(ctx.role, "catalog.view")) return deny("ver el catálogo");
  const [services, packages] = await Promise.all([
    serviceCatalog.listServices(ctx),
    serviceCatalog.listPackages(ctx),
  ]);
  return jsonSafe({
    href: "/crm/servicios",
    packagesHref: "/crm/servicios/paquetes",
    services: services.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: formatMoney(row.defaultPrice, row.currency),
    })),
    packages: packages.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      price: formatMoney(row.defaultPrice, row.currency),
      items: row.items.map((item) => ({
        service: item.service.name,
        quantity: item.quantity,
      })),
    })),
  });
}

export function getRoutesAndHowTo(topic?: string) {
  const needle = topic?.trim().toLowerCase();
  const routes = needle
    ? CRM_ROUTES.filter(
        (route) =>
          route.label.toLowerCase().includes(needle) ||
          route.how.toLowerCase().includes(needle) ||
          route.href.toLowerCase().includes(needle),
      )
    : CRM_ROUTES;
  return {
    instruction:
      "Incluye en tu respuesta final enlaces Markdown clicables con los href exactos de `routes` donde clickable sea true. Ejemplo: [Nuevo cliente](/crm/clientes/nuevo).",
    routes: (routes.length > 0 ? routes : CRM_ROUTES).map((route) => ({
      label: route.label,
      href: route.href.includes("{") ? route.href.replace(/\{id\}/g, ":id") : route.href,
      how: route.how,
      clickable: !route.href.includes("{"),
    })),
    guide: HOW_TO_GUIDE,
  };
}
