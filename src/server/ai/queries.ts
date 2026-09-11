import type {
  CaseState,
  ClientStatus,
  PaymentStatus,
  Prisma,
  QuoteStatus,
  ReceiptStatus,
  RoundStatus,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { formatMoney } from "@/src/lib/format";
import { CRM_ROUTES, HOW_TO_GUIDE } from "@/src/lib/ai/knowledge";
import { fullName, jsonSafe } from "@/src/lib/ai/serialize";
import {
  CASE_STATE_LABELS,
  CLIENT_STATUS_LABELS,
  COMPARISON_RESULT_LABELS,
  CREDIT_BUREAU_LABELS,
  DISPUTE_ITEM_STATUS_LABELS,
  DISPUTE_OUTCOME_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  RECEIPT_STATUS_LABELS,
  ROUND_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  labelFor,
} from "@/src/lib/labels";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { can, type PermissionAction } from "@/src/server/auth/permissions";
import { getSettings } from "@/src/server/config";
import { getDashboardSummary } from "@/src/server/dashboard";
import { DomainError } from "@/src/server/errors";
import * as clientService from "@/src/server/clients";
import * as caseService from "@/src/server/cases";
import * as serviceCatalog from "@/src/server/services";

const SEARCH_LIMIT = 8;
const LIST_LIMIT = 50;

export const CRM_LIST_ENTITIES = [
  "clients",
  "cases",
  "payments",
  "tasks",
  "quotes",
  "rounds",
  "receipts",
] as const;

export type CrmListEntity = (typeof CRM_LIST_ENTITIES)[number];

function contains(q: string) {
  return { contains: q };
}

function deny(action: string) {
  return { error: `No tienes permiso para ${action}.` };
}

function foldStatus(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const STATUS_ALIASES: Record<CrmListEntity, Record<string, string>> = {
  clients: {
    lead: "LEAD",
    prospecto: "LEAD",
    prospectos: "LEAD",
    active: "ACTIVE",
    activo: "ACTIVE",
    activos: "ACTIVE",
    paused: "PAUSED",
    pausado: "PAUSED",
    pausados: "PAUSED",
    completed: "COMPLETED",
    completado: "COMPLETED",
    completados: "COMPLETED",
    cancelled: "CANCELLED",
    cancelado: "CANCELLED",
    cancelados: "CANCELLED",
    archived: "ARCHIVED",
    archivado: "ARCHIVED",
    archivados: "ARCHIVED",
  },
  cases: {
    open: "OPEN",
    abierto: "OPEN",
    abiertos: "OPEN",
    paused: "PAUSED",
    pausado: "PAUSED",
    completed: "COMPLETED",
    completado: "COMPLETED",
    cancelled: "CANCELLED",
    cancelado: "CANCELLED",
  },
  payments: {
    pending: "PENDING",
    pendiente: "PENDING",
    pendientes: "PENDING",
    received: "RECEIVED",
    recibido: "RECEIVED",
    recibidos: "RECEIVED",
    cancelled: "CANCELLED",
    cancelado: "CANCELLED",
    refunded: "REFUNDED",
    reembolsado: "REFUNDED",
  },
  tasks: {
    pending: "PENDING",
    pendiente: "PENDING",
    pendientes: "PENDING",
    in_progress: "IN_PROGRESS",
    "en progreso": "IN_PROGRESS",
    completed: "COMPLETED",
    completada: "COMPLETED",
    completadas: "COMPLETED",
    cancelled: "CANCELLED",
    cancelada: "CANCELLED",
  },
  quotes: {
    draft: "DRAFT",
    borrador: "DRAFT",
    sent: "SENT",
    enviada: "SENT",
    enviadas: "SENT",
    accepted: "ACCEPTED",
    aceptada: "ACCEPTED",
    rejected: "REJECTED",
    rechazada: "REJECTED",
    expired: "EXPIRED",
    vencida: "EXPIRED",
    partial: "PARTIAL",
    pagada: "PAID",
    paid: "PAID",
    cancelled: "CANCELLED",
    cancelada: "CANCELLED",
  },
  rounds: {
    draft: "DRAFT",
    borrador: "DRAFT",
    preparing: "PREPARING",
    sent: "SENT",
    enviada: "SENT",
    waiting_update: "WAITING_UPDATE",
    reviewing: "REVIEWING",
    completed: "COMPLETED",
    completada: "COMPLETED",
    cancelled: "CANCELLED",
    cancelada: "CANCELLED",
  },
  receipts: {
    issued: "ISSUED",
    emitido: "ISSUED",
    emitidos: "ISSUED",
    void: "VOID",
    anulado: "VOID",
    anulados: "VOID",
  },
};

function resolveListStatus(
  entity: CrmListEntity,
  raw?: string,
): { ok: true; status?: string } | { ok: false; error: string } {
  if (!raw?.trim()) return { ok: true };
  const folded = foldStatus(raw);
  if (folded === "all" || folded === "todos" || folded === "todas" || folded === "*") {
    return { ok: true };
  }
  const aliases = STATUS_ALIASES[entity];
  const allowed = new Set(Object.values(aliases));
  const fromAlias = aliases[folded];
  const fromCode = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const status = fromAlias ?? (allowed.has(fromCode) ? fromCode : undefined);
  if (!status) {
    return {
      ok: false,
      error: `Estado no válido para ${entity}. Usa uno de: ${[...allowed].join(", ")} o omite el filtro para todos.`,
    };
  }
  return { ok: true, status };
}

function formatCounts(
  rows: Array<{ key: string; count: number }>,
  labels: Record<string, string>,
) {
  return rows.map((row) => ({
    status: row.key,
    statusLabel: labelFor(labels, row.key),
    count: row.count,
  }));
}

function listMeta(args: {
  entity: CrmListEntity;
  listHref: string;
  items: unknown[];
  total: number;
  counts: Array<{ status: string; statusLabel: string; count: number }>;
  note?: string;
}) {
  return {
    entity: args.entity,
    shown: args.items.length,
    total: args.total,
    hasMore: args.total > args.items.length,
    listHref: args.listHref,
    countsByStatus: args.counts,
    note: args.note,
    items: args.items,
  };
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
  const [summary, clientGroups] = await Promise.all([
    getDashboardSummary(ctx),
    can(ctx.role, "clients.view")
      ? prisma.client.groupBy({
          by: ["status"],
          where: { organizationId: ctx.organizationId },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const w = summary.widgets;
  return jsonSafe(
    {
    generatedAt: summary.generatedAt,
    timezone: summary.timezone,
    note: "counts.activeClients es solo status ACTIVE. Los prospectos (LEAD) están en clientCountsByStatus. Para listar nombres usa listCrm.",
    clientCountsByStatus: formatCounts(
      clientGroups.map((row) => ({ key: row.status, count: row._count._all })),
      CLIENT_STATUS_LABELS,
    ),
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
      documentsPendingCases: w.documentsPendingCases.count,
      reportsToReview: w.reportsToReview.count,
      roundsToPrepare: w.roundsToPrepare.count,
      roundsWaitingUpdate: w.roundsWaitingUpdate.count,
      overdueUpdates: w.overdueUpdates.count,
      overduePayments: w.overduePayments.count,
      newLeads: w.newLeads.count,
      conversions: w.conversions.count,
      disputedItems: w.disputedItems.count,
      deletedItems: w.deletedItems.count,
      updatedItems: w.updatedItems.count,
    },
    overdueTasks: w.overdueTasks.items.map((task) => ({
      title: task.title,
      dueAt: task.dueAt,
      client: task.client ? fullName(task.client) : null,
      href: "/crm/tareas?due=overdue",
    })),
    casesWaitingUpdate: w.casesWaitingUpdate.items.map((serviceCase) => ({
      caseNumber: serviceCase.caseNumber,
      nextActionAt: serviceCase.nextActionAt,
      client: fullName(serviceCase.client),
      href: serviceCase.caseId
        ? `/crm/casos/${serviceCase.caseId}`
        : `/crm/clientes/${serviceCase.client.id}/servicios`,
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
    },
    summary.timezone,
  );
}

const LIST_PERMISSION: Record<CrmListEntity, PermissionAction> = {
  clients: "clients.view",
  cases: "cases.view",
  payments: "payments.view",
  tasks: "tasks.view",
  quotes: "quotes.view",
  rounds: "rounds.view",
  receipts: "receipts.view",
};

const LIST_HREF: Record<CrmListEntity, string> = {
  clients: "/crm/clientes",
  cases: "/crm/casos",
  payments: "/crm/pagos",
  tasks: "/crm/tareas",
  quotes: "/crm/cotizaciones",
  rounds: "/crm/rondas",
  receipts: "/crm/recibos",
};

export async function listCrm(
  ctx: OrganizationContext,
  entity: CrmListEntity,
  filters: { status?: string; q?: string } = {},
) {
  const permission = LIST_PERMISSION[entity];
  if (!can(ctx.role, permission)) {
    return deny(permission.replace(".", " "));
  }

  const resolved = resolveListStatus(entity, filters.status);
  if (!resolved.ok) return { error: resolved.error };

  const orgId = ctx.organizationId;
  const q = filters.q?.trim() || undefined;
  const status = resolved.status;
  const listHref = LIST_HREF[entity];

  if (entity === "clients") {
    const where: Prisma.ClientWhereInput = {
      organizationId: orgId,
      ...(status ? { status: status as ClientStatus } : {}),
      ...(q
        ? {
            OR: [
              { firstName: contains(q) },
              { lastName: contains(q) },
              { email: contains(q) },
              { phone: contains(q) },
              { clientCode: contains(q) },
            ],
          }
        : {}),
    };
    const [rows, total, groups] = await Promise.all([
      prisma.client.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: LIST_LIMIT,
      }),
      prisma.client.count({ where }),
      prisma.client.groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
    ]);
    return jsonSafe(
      listMeta({
        entity,
        listHref,
        total,
        counts: formatCounts(
          groups.map((row) => ({ key: row.status, count: row._count._all })),
          CLIENT_STATUS_LABELS,
        ),
        note: "Tabla mínima: Nombre, Estado (statusLabel) y [ver cliente](href). No muestres código, id, responsable ni la ruta como texto.",
        items: rows.map((row) => ({
          name: fullName(row),
          statusLabel: labelFor(CLIENT_STATUS_LABELS, row.status),
          href: `/crm/clientes/${row.id}`,
          linkLabel: "ver cliente",
        })),
      }),
    );
  }

  if (entity === "cases") {
    const where: Prisma.CreditCaseWhereInput = {
      organizationId: orgId,
      ...(status ? { state: status as CaseState } : {}),
      ...(q
        ? {
            OR: [
              { caseCode: contains(q) },
              { summary: contains(q) },
              { client: { firstName: contains(q) } },
              { client: { lastName: contains(q) } },
              { client: { clientCode: contains(q) } },
            ],
          }
        : {}),
    };
    const [rows, total, groups] = await Promise.all([
      prisma.creditCase.findMany({
        where,
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
        orderBy: [{ openedAt: "desc" }, { id: "desc" }],
        take: LIST_LIMIT,
      }),
      prisma.creditCase.count({ where }),
      prisma.creditCase.groupBy({
        by: ["state"],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
    ]);
    return jsonSafe(
      listMeta({
        entity,
        listHref,
        total,
        counts: formatCounts(
          groups.map((row) => ({ key: row.state, count: row._count._all })),
          CASE_STATE_LABELS,
        ),
        items: rows.map((row) => ({
          id: row.id,
          caseCode: row.caseCode,
          state: row.state,
          statusLabel: labelFor(CASE_STATE_LABELS, row.state),
          stage: row.stage.name,
          nextReviewAt: row.nextReviewAt,
          client: fullName(row.client),
          href: `/crm/casos/${row.id}`,
        })),
      }),
    );
  }

  if (entity === "payments") {
    const where: Prisma.PaymentWhereInput = {
      organizationId: orgId,
      ...(status ? { status: status as PaymentStatus } : {}),
      ...(q
        ? {
            OR: [
              { reference: contains(q) },
              { client: { firstName: contains(q) } },
              { client: { lastName: contains(q) } },
              { quote: { folio: contains(q) } },
            ],
          }
        : {}),
    };
    const [rows, total, groups] = await Promise.all([
      prisma.payment.findMany({
        where,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          method: true,
          dueAt: true,
          receivedAt: true,
          reference: true,
          client: { select: { id: true, firstName: true, lastName: true } },
          quote: { select: { folio: true } },
        },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
      }),
      prisma.payment.count({ where }),
      prisma.payment.groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
    ]);
    return jsonSafe(
      listMeta({
        entity,
        listHref,
        total,
        counts: formatCounts(
          groups.map((row) => ({ key: row.status, count: row._count._all })),
          PAYMENT_STATUS_LABELS,
        ),
        items: rows.map((row) => ({
          id: row.id,
          amount: formatMoney(row.amount, row.currency),
          status: row.status,
          statusLabel: labelFor(PAYMENT_STATUS_LABELS, row.status),
          method: labelFor(PAYMENT_METHOD_LABELS, row.method),
          dueAt: row.dueAt,
          receivedAt: row.receivedAt,
          reference: row.reference,
          client: fullName(row.client),
          quote: row.quote?.folio ?? null,
          href: "/crm/pagos",
        })),
      }),
    );
  }

  if (entity === "tasks") {
    const where: Prisma.TaskWhereInput = {
      organizationId: orgId,
      ...(status ? { status: status as TaskStatus } : {}),
      ...(q
        ? {
            OR: [
              { title: contains(q) },
              { description: contains(q) },
              { client: { firstName: contains(q) } },
              { client: { lastName: contains(q) } },
            ],
          }
        : {}),
    };
    const [rows, total, groups] = await Promise.all([
      prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueAt: true,
          client: { select: { firstName: true, lastName: true } },
          case: { select: { id: true, caseCode: true } },
        },
        orderBy: [{ dueAt: "asc" }, { id: "desc" }],
        take: LIST_LIMIT,
      }),
      prisma.task.count({ where }),
      prisma.task.groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
    ]);
    return jsonSafe(
      listMeta({
        entity,
        listHref,
        total,
        counts: formatCounts(
          groups.map((row) => ({ key: row.status, count: row._count._all })),
          TASK_STATUS_LABELS,
        ),
        items: rows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          statusLabel: labelFor(TASK_STATUS_LABELS, row.status),
          priority: labelFor(TASK_PRIORITY_LABELS, row.priority),
          dueAt: row.dueAt,
          client: row.client ? fullName(row.client) : null,
          caseCode: row.case?.caseCode ?? null,
          href: "/crm/tareas",
        })),
      }),
    );
  }

  if (entity === "quotes") {
    const where: Prisma.QuoteWhereInput = {
      organizationId: orgId,
      ...(status ? { status: status as QuoteStatus } : {}),
      ...(q
        ? {
            OR: [
              { folio: contains(q) },
              { client: { firstName: contains(q) } },
              { client: { lastName: contains(q) } },
              { client: { clientCode: contains(q) } },
            ],
          }
        : {}),
    };
    const [rows, total, groups] = await Promise.all([
      prisma.quote.findMany({
        where,
        select: {
          id: true,
          folio: true,
          status: true,
          total: true,
          currency: true,
          issuedAt: true,
          client: { select: { firstName: true, lastName: true } },
        },
        orderBy: { issuedAt: "desc" },
        take: LIST_LIMIT,
      }),
      prisma.quote.count({ where }),
      prisma.quote.groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
    ]);
    return jsonSafe(
      listMeta({
        entity,
        listHref,
        total,
        counts: formatCounts(
          groups.map((row) => ({ key: row.status, count: row._count._all })),
          QUOTE_STATUS_LABELS,
        ),
        items: rows.map((row) => ({
          id: row.id,
          folio: row.folio,
          status: row.status,
          statusLabel: labelFor(QUOTE_STATUS_LABELS, row.status),
          total: formatMoney(row.total, row.currency),
          issuedAt: row.issuedAt,
          client: fullName(row.client),
          href: `/crm/cotizaciones/${row.id}`,
        })),
      }),
    );
  }

  if (entity === "rounds") {
    const where: Prisma.CreditRoundWhereInput = {
      organizationId: orgId,
      ...(status ? { status: status as RoundStatus } : {}),
      ...(q
        ? {
            OR: [
              { notes: contains(q) },
              { case: { caseCode: contains(q) } },
              { case: { client: { firstName: contains(q) } } },
              { case: { client: { lastName: contains(q) } } },
            ],
          }
        : {}),
    };
    const [rows, total, groups] = await Promise.all([
      prisma.creditRound.findMany({
        where,
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
        orderBy: { expectedReviewAt: "asc" },
        take: LIST_LIMIT,
      }),
      prisma.creditRound.count({ where }),
      prisma.creditRound.groupBy({
        by: ["status"],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
    ]);
    return jsonSafe(
      listMeta({
        entity,
        listHref,
        total,
        counts: formatCounts(
          groups.map((row) => ({ key: row.status, count: row._count._all })),
          ROUND_STATUS_LABELS,
        ),
        items: rows.map((row) => ({
          id: row.id,
          roundNumber: row.roundNumber,
          status: row.status,
          statusLabel: labelFor(ROUND_STATUS_LABELS, row.status),
          expectedReviewAt: row.expectedReviewAt,
          caseCode: row.case.caseCode,
          client: fullName(row.case.client),
          href: `/crm/casos/${row.case.id}/rondas`,
        })),
      }),
    );
  }

  const where: Prisma.ReceiptWhereInput = {
    organizationId: orgId,
    ...(status ? { status: status as ReceiptStatus } : {}),
    ...(q
      ? {
          OR: [
            { folio: contains(q) },
            { client: { firstName: contains(q) } },
            { client: { lastName: contains(q) } },
          ],
        }
      : {}),
  };
  const [rows, total, groups] = await Promise.all([
    prisma.receipt.findMany({
      where,
      select: {
        id: true,
        folio: true,
        status: true,
        amount: true,
        currency: true,
        issuedAt: true,
        client: { select: { firstName: true, lastName: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: LIST_LIMIT,
    }),
    prisma.receipt.count({ where }),
    prisma.receipt.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: { _all: true },
    }),
  ]);
  return jsonSafe(
    listMeta({
      entity,
      listHref,
      total,
      counts: formatCounts(
        groups.map((row) => ({ key: row.status, count: row._count._all })),
        RECEIPT_STATUS_LABELS,
      ),
      items: rows.map((row) => ({
        id: row.id,
        folio: row.folio,
        status: row.status,
        statusLabel: labelFor(RECEIPT_STATUS_LABELS, row.status),
        amount: formatMoney(row.amount, row.currency),
        issuedAt: row.issuedAt,
        client: fullName(row.client),
        href: "/crm/recibos",
      })),
    }),
  );
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
      statusLabel: labelFor(CLIENT_STATUS_LABELS, row.status),
      href: `/crm/clientes/${row.id}`,
      expedienteHref: `/crm/clientes/${row.id}/expediente`,
    })),
    cases: cases?.map((row) => ({
      id: row.id,
      caseCode: row.caseCode,
      state: row.state,
      statusLabel: labelFor(CASE_STATE_LABELS, row.state),
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
      statusLabel: labelFor(QUOTE_STATUS_LABELS, row.status),
      total: formatMoney(row.total, row.currency),
      client: fullName(row.client),
      href: `/crm/cotizaciones/${row.id}`,
    })),
    payments: payments?.map((row) => ({
      id: row.id,
      amount: formatMoney(row.amount, row.currency),
      status: row.status,
      statusLabel: labelFor(PAYMENT_STATUS_LABELS, row.status),
      method: labelFor(PAYMENT_METHOD_LABELS, row.method),
      dueAt: row.dueAt,
      client: fullName(row.client),
      quote: row.quote?.folio ?? null,
      href: "/crm/pagos",
    })),
    tasks: tasks?.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      statusLabel: labelFor(TASK_STATUS_LABELS, row.status),
      priority: labelFor(TASK_PRIORITY_LABELS, row.priority),
      dueAt: row.dueAt,
      client: row.client ? fullName(row.client) : null,
      caseCode: row.case?.caseCode ?? null,
      href: row.case ? `/crm/casos/${row.case.id}/tareas` : "/crm/tareas",
    })),
    rounds: rounds?.map((row) => ({
      id: row.id,
      roundNumber: row.roundNumber,
      status: row.status,
      statusLabel: labelFor(ROUND_STATUS_LABELS, row.status),
      expectedReviewAt: row.expectedReviewAt,
      caseCode: row.case.caseCode,
      client: fullName(row.case.client),
      href: `/crm/casos/${row.case.id}/rondas`,
    })),
    receipts: receipts?.map((row) => ({
      id: row.id,
      folio: row.folio,
      status: row.status,
      statusLabel: labelFor(RECEIPT_STATUS_LABELS, row.status),
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
        statusLabel: labelFor(CLIENT_STATUS_LABELS, detail.client.status),
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

/**
 * Detalle crediticio de un caso: último reporte + scores, ítems de disputa
 * de la ronda activa y última comparación. Nunca incluye SSN ni cifrados.
 */
export async function getCreditCaseDetail(
  ctx: OrganizationContext,
  caseId: string,
) {
  if (!can(ctx.role, "cases.view")) return deny("ver casos");

  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: {
      id: true,
      caseCode: true,
      state: true,
      nextReviewAt: true,
      stage: { select: { key: true, name: true } },
      client: {
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
          status: true,
          email: true,
          phone: true,
        },
      },
    },
  });
  if (!creditCase) return { error: "Caso no encontrado." };

  const [latestReport, activeRound, latestComparison] = await Promise.all([
    prisma.creditReport.findFirst({
      where: { caseId, organizationId: ctx.organizationId },
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        type: true,
        reportDate: true,
        provider: true,
        notes: true,
        snapshots: {
          select: {
            bureau: true,
            score: true,
            totalAccounts: true,
            openAccounts: true,
            closedAccounts: true,
            negativeAccounts: true,
            collections: true,
            inquiries: true,
            totalBalance: true,
            utilization: true,
          },
          orderBy: { bureau: "asc" },
        },
      },
    }),
    prisma.creditRound.findFirst({
      where: {
        caseId,
        organizationId: ctx.organizationId,
        status: {
          in: ["DRAFT", "PREPARING", "SENT", "WAITING_UPDATE", "REVIEWING"],
        },
      },
      orderBy: { roundNumber: "desc" },
      select: {
        id: true,
        roundNumber: true,
        status: true,
        expectedReviewAt: true,
        disputeItems: {
          select: {
            id: true,
            bureau: true,
            disputeReason: true,
            status: true,
            outcome: true,
            creditItem: {
              select: {
                creditorName: true,
                accountNumberMasked: true,
                balance: true,
              },
            },
          },
          take: 40,
        },
      },
    }),
    prisma.reportComparison.findFirst({
      where: { caseId, organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        notes: true,
        items: {
          select: {
            autoResult: true,
            manualResult: true,
          },
        },
      },
    }),
  ]);

  const comparisonSummary = latestComparison
    ? (() => {
        const summary = {
          deleted: 0,
          updated: 0,
          verified: 0,
          unchanged: 0,
          new: 0,
        };
        for (const item of latestComparison.items) {
          const result = item.manualResult ?? item.autoResult;
          switch (result) {
            case "DELETED":
              summary.deleted += 1;
              break;
            case "UPDATED":
              summary.updated += 1;
              break;
            case "VERIFIED":
              summary.verified += 1;
              break;
            case "UNCHANGED":
              summary.unchanged += 1;
              break;
            case "NEW":
              summary.new += 1;
              break;
          }
        }
        return summary;
      })()
    : null;

  const disputeSummary = {
    total: activeRound?.disputeItems.length ?? 0,
    byStatus: {} as Record<string, number>,
    byOutcome: {} as Record<string, number>,
  };
  for (const item of activeRound?.disputeItems ?? []) {
    disputeSummary.byStatus[item.status] =
      (disputeSummary.byStatus[item.status] ?? 0) + 1;
    if (item.outcome) {
      disputeSummary.byOutcome[item.outcome] =
        (disputeSummary.byOutcome[item.outcome] ?? 0) + 1;
    }
  }

  return jsonSafe({
    note: "Sin SSN ni campos cifrados. No inventes eliminaciones: usa solo outcome/comparación reales.",
    case: {
      id: creditCase.id,
      caseCode: creditCase.caseCode,
      state: creditCase.state,
      statusLabel: labelFor(CASE_STATE_LABELS, creditCase.state),
      stage: creditCase.stage.name,
      stageKey: creditCase.stage.key,
      nextReviewAt: creditCase.nextReviewAt,
      href: `/crm/casos/${creditCase.id}`,
      creditoHref: `/crm/casos/${creditCase.id}/credito`,
      rondasHref: `/crm/casos/${creditCase.id}/rondas`,
      client: {
        id: creditCase.client.id,
        name: fullName(creditCase.client),
        statusLabel: labelFor(CLIENT_STATUS_LABELS, creditCase.client.status),
        email: creditCase.client.email,
        phone: creditCase.client.phone,
        href: `/crm/clientes/${creditCase.client.id}`,
      },
    },
    latestReport: latestReport
      ? {
          id: latestReport.id,
          type: latestReport.type,
          reportDate: latestReport.reportDate,
          provider: latestReport.provider,
          notes: latestReport.notes,
          scores: latestReport.snapshots.map((s) => ({
            bureau: s.bureau,
            bureauLabel: labelFor(CREDIT_BUREAU_LABELS, s.bureau),
            score: s.score,
            totalAccounts: s.totalAccounts,
            openAccounts: s.openAccounts,
            closedAccounts: s.closedAccounts,
            negativeAccounts: s.negativeAccounts,
            collections: s.collections,
            inquiries: s.inquiries,
            totalBalance: s.totalBalance?.toString() ?? null,
            utilization: s.utilization?.toString() ?? null,
          })),
        }
      : null,
    activeRound: activeRound
      ? {
          id: activeRound.id,
          roundNumber: activeRound.roundNumber,
          status: activeRound.status,
          statusLabel: labelFor(ROUND_STATUS_LABELS, activeRound.status),
          expectedReviewAt: activeRound.expectedReviewAt,
          disputeSummary,
          disputeItems: activeRound.disputeItems.map((item) => ({
            bureau: labelFor(CREDIT_BUREAU_LABELS, item.bureau),
            creditor: item.creditItem.creditorName,
            accountMasked: item.creditItem.accountNumberMasked,
            balance: item.creditItem.balance?.toString() ?? null,
            reason: item.disputeReason,
            status: item.status,
            statusLabel: labelFor(DISPUTE_ITEM_STATUS_LABELS, item.status),
            outcome: item.outcome,
            outcomeLabel: item.outcome
              ? labelFor(DISPUTE_OUTCOME_LABELS, item.outcome)
              : null,
          })),
        }
      : null,
    latestComparison: latestComparison
      ? {
          id: latestComparison.id,
          createdAt: latestComparison.createdAt,
          notes: latestComparison.notes,
          summary: comparisonSummary,
          href: `/crm/casos/${caseId}/comparaciones/${latestComparison.id}`,
          resultLabels: COMPARISON_RESULT_LABELS,
        }
      : null,
  });
}

/** Clientes/casos que requieren atención crediticia esta semana. */
export async function listCreditAttention(ctx: OrganizationContext) {
  if (!can(ctx.role, "cases.view") && !can(ctx.role, "dashboard.view")) {
    return deny("ver atención crediticia");
  }

  const orgId = ctx.organizationId;
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [waitingUpdateOverdue, reviewsThisWeek, docsPending, roundsPreparing] =
    await Promise.all([
      prisma.creditRound.findMany({
        where: {
          organizationId: orgId,
          status: "WAITING_UPDATE",
          OR: [
            { expectedReviewAt: { lt: now } },
            { expectedReviewAt: null },
          ],
        },
        select: {
          id: true,
          roundNumber: true,
          expectedReviewAt: true,
          case: {
            select: {
              id: true,
              caseCode: true,
              client: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { expectedReviewAt: "asc" },
        take: 15,
      }),
      prisma.creditCase.findMany({
        where: {
          organizationId: orgId,
          state: "OPEN",
          nextReviewAt: { gte: now, lte: weekEnd },
        },
        select: {
          id: true,
          caseCode: true,
          nextReviewAt: true,
          client: { select: { firstName: true, lastName: true } },
        },
        orderBy: { nextReviewAt: "asc" },
        take: 15,
      }),
      prisma.creditCase.findMany({
        where: {
          organizationId: orgId,
          state: "OPEN",
          stage: { key: "DOCUMENTS_PENDING" },
        },
        select: {
          id: true,
          caseCode: true,
          client: { select: { firstName: true, lastName: true } },
        },
        take: 10,
      }),
      prisma.creditRound.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["DRAFT", "PREPARING"] },
        },
        select: {
          id: true,
          roundNumber: true,
          status: true,
          case: {
            select: {
              id: true,
              caseCode: true,
              client: { select: { firstName: true, lastName: true } },
            },
          },
        },
        take: 10,
      }),
    ]);

  return jsonSafe({
    waitingUpdateOverdue: waitingUpdateOverdue.map((r) => ({
      roundNumber: r.roundNumber,
      expectedReviewAt: r.expectedReviewAt,
      caseCode: r.case.caseCode,
      client: fullName(r.case.client),
      href: `/crm/casos/${r.case.id}/rondas`,
    })),
    reviewsThisWeek: reviewsThisWeek.map((c) => ({
      caseCode: c.caseCode,
      nextReviewAt: c.nextReviewAt,
      client: fullName(c.client),
      href: `/crm/casos/${c.id}`,
    })),
    documentsPending: docsPending.map((c) => ({
      caseCode: c.caseCode,
      client: fullName(c.client),
      href: `/crm/casos/${c.id}`,
    })),
    roundsToPrepare: roundsPreparing.map((r) => ({
      roundNumber: r.roundNumber,
      statusLabel: labelFor(ROUND_STATUS_LABELS, r.status),
      caseCode: r.case.caseCode,
      client: fullName(r.case.client),
      href: `/crm/casos/${r.case.id}/rondas`,
    })),
    links: {
      dashboard: "/crm/dashboard",
      cases: "/crm/casos",
      rounds: "/crm/rondas",
    },
  });
}

/**
 * Resumen de progreso crediticio por nombre de cliente.
 * Solo reporta eliminaciones/actualizaciones con outcome o comparación real.
 */
export async function searchCreditProgress(
  ctx: OrganizationContext,
  clientName: string,
) {
  if (!can(ctx.role, "cases.view")) return deny("ver casos");

  const q = clientName.trim();
  if (q.length < 2) {
    return { error: "Escribe al menos 2 caracteres del nombre." };
  }

  const clients = await prisma.client.findMany({
    where: {
      organizationId: ctx.organizationId,
      OR: [
        { firstName: contains(q) },
        { lastName: contains(q) },
        { clientCode: contains(q) },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      clientCode: true,
      status: true,
      cases: {
        where: { state: { in: ["OPEN", "PAUSED", "COMPLETED"] } },
        select: {
          id: true,
          caseCode: true,
          state: true,
          nextReviewAt: true,
          stage: { select: { name: true } },
        },
        orderBy: { openedAt: "desc" },
        take: 3,
      },
    },
    take: 5,
    orderBy: { updatedAt: "desc" },
  });

  if (clients.length === 0) {
    return { query: q, results: [], note: "Sin coincidencias." };
  }

  const results = [];
  for (const client of clients) {
    const caseIds = client.cases.map((c) => c.id);
    const [outcomes, activeDisputes, latestComparison] = await Promise.all([
      prisma.disputeItem.groupBy({
        by: ["outcome"],
        where: {
          organizationId: ctx.organizationId,
          outcome: { not: null },
          round: { caseId: { in: caseIds } },
        },
        _count: { _all: true },
      }),
      prisma.disputeItem.count({
        where: {
          organizationId: ctx.organizationId,
          status: { in: ["SENT", "WAITING", "RESPONDED"] },
          round: { caseId: { in: caseIds } },
        },
      }),
      caseIds.length
        ? prisma.reportComparison.findFirst({
            where: {
              organizationId: ctx.organizationId,
              caseId: { in: caseIds },
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              caseId: true,
              createdAt: true,
              items: {
                select: { autoResult: true, manualResult: true },
              },
            },
          })
        : Promise.resolve(null),
    ]);

    const outcomeCounts: Record<string, number> = {};
    for (const row of outcomes) {
      if (row.outcome) outcomeCounts[row.outcome] = row._count._all;
    }

    let comparisonSummary = null;
    if (latestComparison) {
      const summary = {
        deleted: 0,
        updated: 0,
        verified: 0,
        unchanged: 0,
        new: 0,
      };
      for (const item of latestComparison.items) {
        const result = item.manualResult ?? item.autoResult;
        if (result === "DELETED") summary.deleted += 1;
        else if (result === "UPDATED") summary.updated += 1;
        else if (result === "VERIFIED") summary.verified += 1;
        else if (result === "UNCHANGED") summary.unchanged += 1;
        else if (result === "NEW") summary.new += 1;
      }
      comparisonSummary = {
        id: latestComparison.id,
        createdAt: latestComparison.createdAt,
        href: `/crm/casos/${latestComparison.caseId}/comparaciones/${latestComparison.id}`,
        summary,
      };
    }

    results.push({
      client: {
        name: fullName(client),
        clientCode: client.clientCode,
        statusLabel: labelFor(CLIENT_STATUS_LABELS, client.status),
        href: `/crm/clientes/${client.id}`,
      },
      cases: client.cases.map((c) => ({
        caseCode: c.caseCode,
        stateLabel: labelFor(CASE_STATE_LABELS, c.state),
        stage: c.stage.name,
        nextReviewAt: c.nextReviewAt,
        href: `/crm/casos/${c.id}/credito`,
      })),
      progress: {
        activeDisputes,
        outcomes: {
          deleted: outcomeCounts.DELETED ?? 0,
          updated: outcomeCounts.UPDATED ?? 0,
          verified: outcomeCounts.VERIFIED ?? 0,
          noChange: outcomeCounts.NO_CHANGE ?? 0,
        },
        note: "Solo cuenta outcomes registrados. No asumas eliminaciones sin dato.",
        latestComparison: comparisonSummary,
      },
    });
  }

  return jsonSafe({
    query: q,
    results,
    rules:
      "Nunca inventes eliminaciones. Si deleted=0, di que no hay eliminaciones registradas.",
  });
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

const MAIL_FOLDER_MAP = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFTS",
  archive: "ARCHIVE",
  spam: "SPAM",
  trash: "TRASH",
} as const;

type MailFolderKey = keyof typeof MAIL_FOLDER_MAP;

function truncateBody(text: string | null | undefined, max = 4000): string {
  const value = (text ?? "").trim();
  if (!value) return "(sin texto)";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/** Lista correos de una carpeta (solo lectura). */
export async function listMailsSnapshot(
  ctx: OrganizationContext,
  input: { folder?: MailFolderKey; q?: string; limit?: number } = {},
) {
  if (!can(ctx.role, "mails.view")) return deny("ver correos");

  const folderKey = input.folder ?? "inbox";
  const folder = MAIL_FOLDER_MAP[folderKey] ?? "INBOX";
  const limit = Math.min(input.limit ?? 15, 30);
  const q = input.q?.trim();

  const where: Prisma.MailMessageWhereInput = {
    organizationId: ctx.organizationId,
    folder,
    ...(q
      ? {
          OR: [
            { subject: { contains: q } },
            { fromAddress: { contains: q } },
            { fromName: { contains: q } },
            { bodyText: { contains: q } },
          ],
        }
      : {}),
  };

  const [rows, unread] = await Promise.all([
    prisma.mailMessage.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        folder: true,
        direction: true,
        fromAddress: true,
        fromName: true,
        toAddresses: true,
        subject: true,
        isRead: true,
        sentAt: true,
        receivedAt: true,
        createdAt: true,
        client: {
          select: { id: true, firstName: true, lastName: true, clientCode: true },
        },
      },
    }),
    prisma.mailMessage.count({
      where: {
        organizationId: ctx.organizationId,
        folder: "INBOX",
        isRead: false,
      },
    }),
  ]);

  return jsonSafe({
    folder: folderKey,
    listHref: `/crm/mails?folder=${folderKey}`,
    composeHref: "/crm/mails/nuevo",
    unreadInbox: unread,
    count: rows.length,
    items: rows.map((mail) => ({
      id: mail.id,
      subject: mail.subject || "(sin asunto)",
      from: mail.fromName || mail.fromAddress,
      to: Array.isArray(mail.toAddresses) ? mail.toAddresses : [],
      direction: mail.direction,
      isRead: mail.isRead,
      date: mail.receivedAt ?? mail.sentAt ?? mail.createdAt,
      client: mail.client
        ? { name: fullName(mail.client), href: `/crm/clientes/${mail.client.id}` }
        : null,
      href: `/crm/mails/${mail.id}`,
    })),
  });
}

/** Lee el cuerpo de un correo (sin HTML crudo largo). */
export async function getMailSnapshot(ctx: OrganizationContext, mailId: string) {
  if (!can(ctx.role, "mails.view")) return deny("ver correos");

  const mail = await prisma.mailMessage.findFirst({
    where: { id: mailId, organizationId: ctx.organizationId },
    select: {
      id: true,
      folder: true,
      direction: true,
      fromAddress: true,
      fromName: true,
      toAddresses: true,
      ccAddresses: true,
      subject: true,
      bodyText: true,
      isRead: true,
      sentAt: true,
      receivedAt: true,
      createdAt: true,
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          clientCode: true,
        },
      },
    },
  });

  if (!mail) return { error: "Correo no encontrado." };

  return jsonSafe({
    id: mail.id,
    subject: mail.subject || "(sin asunto)",
    from: mail.fromName
      ? `${mail.fromName} <${mail.fromAddress}>`
      : mail.fromAddress,
    to: mail.toAddresses,
    cc: mail.ccAddresses,
    folder: mail.folder,
    direction: mail.direction,
    isRead: mail.isRead,
    date: mail.receivedAt ?? mail.sentAt ?? mail.createdAt,
    body: truncateBody(mail.bodyText),
    client: mail.client
      ? {
          name: fullName(mail.client),
          email: mail.client.email,
          href: `/crm/clientes/${mail.client.id}`,
        }
      : null,
    href: `/crm/mails/${mail.id}`,
    replyHref: `/crm/mails/nuevo?replyTo=${mail.id}`,
    composeHref: "/crm/mails/nuevo",
    instruction:
      "Si el usuario quiere responder, ofrece un borrador (asunto + cuerpo) y el enlace replyHref o composeHref. No envíes el correo tú: el usuario debe enviarlo en la UI.",
  });
}

/**
 * Ayuda a redactar un correo: no envía; devuelve borrador + enlace a redactar.
 */
export async function draftMailHelp(
  ctx: OrganizationContext,
  input: {
    intent: string;
    to?: string;
    clientName?: string;
    tone?: string;
    inReplyToId?: string;
  },
) {
  if (!can(ctx.role, "mails.view")) return deny("usar el correo");

  let replyContext: {
    subject: string;
    from: string;
    bodyPreview: string;
    href: string;
  } | null = null;

  if (input.inReplyToId) {
    const original = await prisma.mailMessage.findFirst({
      where: { id: input.inReplyToId, organizationId: ctx.organizationId },
      select: {
        id: true,
        subject: true,
        fromAddress: true,
        fromName: true,
        bodyText: true,
      },
    });
    if (original) {
      replyContext = {
        subject: original.subject || "(sin asunto)",
        from: original.fromName || original.fromAddress,
        bodyPreview: truncateBody(original.bodyText, 1200),
        href: `/crm/mails/${original.id}`,
      };
    }
  }

  let clientHint: { name: string; email: string | null; href: string } | null =
    null;
  if (input.clientName?.trim()) {
    const q = input.clientName.trim();
    const client = await prisma.client.findFirst({
      where: {
        organizationId: ctx.organizationId,
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { email: { contains: q } },
          { clientCode: { contains: q } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });
    if (client) {
      clientHint = {
        name: fullName(client),
        email: client.email,
        href: `/crm/clientes/${client.id}`,
      };
    }
  }

  const tone = input.tone?.trim() || "claro, amable y profesional";
  const to = input.to?.trim() || clientHint?.email || replyContext?.from || "";

  return jsonSafe({
    mode: "draft_only",
    intent: input.intent,
    tone,
    suggestedTo: to || null,
    client: clientHint,
    replyTo: replyContext,
    composeHref: replyContext
      ? `/crm/mails/nuevo?replyTo=${input.inReplyToId}`
      : "/crm/mails/nuevo",
    instruction: [
      "Redacta un borrador completo en español: asunto + cuerpo.",
      `Tono: ${tone}.`,
      "No envíes el correo. Incluye el enlace composeHref para que el usuario lo pegue y envíe.",
      replyContext
        ? "Es una respuesta: respeta el hilo y sé concreto."
        : "Es un correo nuevo.",
      "Cuerpo corto (4–8 frases), sin jerga innecesaria.",
    ].join(" "),
  });
}
