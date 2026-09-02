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
