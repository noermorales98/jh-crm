import type { OpportunityStage, Prisma, ServiceCaseStatus } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { formatMoney } from "@/src/lib/format";
import { fullName, jsonSafe } from "@/src/lib/ai/serialize";
import { caseHref } from "@/src/lib/routes/case-routes";
import { ForbiddenError, type OrganizationContext } from "@/src/server/auth/guards";
import { can, type PermissionAction } from "@/src/server/auth/permissions";
import { DomainError } from "@/src/server/errors";

/**
 * Consultas de lectura del conector MCP que el asistente interno no tenía:
 * oportunidades, casos de servicio y detalle por id de tarea, cotización y oportunidad.
 * Siempre filtran por organización y comprueban `*.view`. Un id ajeno devuelve null.
 */

export interface ListFilters {
  estado?: string;
  texto?: string;
  limite?: number;
}

const OPPORTUNITY_STAGES: OpportunityStage[] = [
  "NEW_LEAD",
  "CONTACTED",
  "CONSULTATION",
  "INTAKE_SENT",
  "INTAKE_COMPLETED",
  "PROPOSAL",
  "WAITING_PAYMENT",
  "WON",
  "LOST",
];
const SERVICE_CASE_STATUSES: ServiceCaseStatus[] = ["OPEN", "ON_HOLD", "COMPLETED", "CANCELED"];

function requireView(ctx: OrganizationContext, permission: PermissionAction) {
  if (!can(ctx.role, permission)) throw new ForbiddenError("Sin permiso para esta acción.");
}

function pickEnum<T extends string>(value: string | undefined, allowed: T[], label: string): T | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase() as T;
  if (!allowed.includes(upper)) {
    throw new DomainError(`${label} no válido. Usa uno de: ${allowed.join(", ")}.`);
  }
  return upper;
}

function take(limite?: number) {
  return Math.min(Math.max(limite ?? 20, 1), 50);
}

function clientSearch(texto?: string): Prisma.ClientWhereInput | undefined {
  const q = texto?.trim();
  if (!q) return undefined;
  return {
    OR: [
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { clientCode: { contains: q } },
    ],
  };
}

const CLIENT_SELECT = { id: true, clientCode: true, firstName: true, lastName: true } as const;

type ClientRow = { id: string; clientCode: string; firstName: string; lastName: string | null };
function clientInfo(client: ClientRow) {
  return {
    id: client.id,
    code: client.clientCode,
    name: fullName(client),
    href: `/crm/clientes/${client.id}`,
  };
}

// ── Oportunidades ──────────────────────────────────────────────────────────

const OPPORTUNITY_SELECT = {
  id: true,
  stage: true,
  estimatedValue: true,
  source: true,
  campaign: true,
  lostReason: true,
  nextFollowUpAt: true,
  createdAt: true,
  client: { select: CLIENT_SELECT },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.OpportunitySelect;

type OpportunityRow = Prisma.OpportunityGetPayload<{ select: typeof OPPORTUNITY_SELECT }>;
function opportunityInfo(row: OpportunityRow) {
  return {
    id: row.id,
    stage: row.stage,
    estimatedValue: row.estimatedValue ? formatMoney(row.estimatedValue, "USD") : null,
    source: row.source,
    campaign: row.campaign,
    lostReason: row.lostReason,
    nextFollowUpAt: row.nextFollowUpAt,
    createdAt: row.createdAt,
    owner: row.owner?.name ?? null,
    client: clientInfo(row.client),
    href: `/crm/oportunidades?clientId=${row.client.id}`,
  };
}

export async function listOpportunities(ctx: OrganizationContext, filters: ListFilters = {}) {
  requireView(ctx, "opportunities.view");
  const stage = pickEnum(filters.estado, OPPORTUNITY_STAGES, "Etapa");
  const rows = await prisma.opportunity.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(stage ? { stage } : {}),
      ...(clientSearch(filters.texto) ? { client: clientSearch(filters.texto) } : {}),
    },
    select: OPPORTUNITY_SELECT,
    orderBy: { updatedAt: "desc" },
    take: take(filters.limite),
  });
  return jsonSafe({ items: rows.map(opportunityInfo), href: "/crm/oportunidades" });
}

export async function getOpportunityDetail(ctx: OrganizationContext, id: string) {
  requireView(ctx, "opportunities.view");
  const row = await prisma.opportunity.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: OPPORTUNITY_SELECT,
  });
  return row ? jsonSafe(opportunityInfo(row)) : null;
}

// ── Casos de servicio ──────────────────────────────────────────────────────

const SERVICE_CASE_SELECT = {
  id: true,
  caseNumber: true,
  status: true,
  startedAt: true,
  targetDate: true,
  nextActionAt: true,
  completedAt: true,
  quotedAmount: true,
  agreedAmount: true,
  client: { select: CLIENT_SELECT },
  service: { select: { code: true, name: true } },
  stage: { select: { key: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.ServiceCaseSelect;

type ServiceCaseRow = Prisma.ServiceCaseGetPayload<{ select: typeof SERVICE_CASE_SELECT }>;
function serviceCaseInfo(row: ServiceCaseRow) {
  return {
    id: row.id,
    caseNumber: row.caseNumber,
    status: row.status,
    service: row.service.name,
    stage: row.stage.name,
    startedAt: row.startedAt,
    targetDate: row.targetDate,
    nextActionAt: row.nextActionAt,
    completedAt: row.completedAt,
    quotedAmount: row.quotedAmount ? formatMoney(row.quotedAmount, "USD") : null,
    agreedAmount: row.agreedAmount ? formatMoney(row.agreedAmount, "USD") : null,
    assignedTo: row.assignedTo?.name ?? null,
    client: clientInfo(row.client),
    href: caseHref(row.client.id, row.id),
  };
}

export async function listServiceCases(ctx: OrganizationContext, filters: ListFilters = {}) {
  requireView(ctx, "cases.view");
  const status = pickEnum(filters.estado, SERVICE_CASE_STATUSES, "Estado");
  const rows = await prisma.serviceCase.findMany({
    where: {
      organizationId: ctx.organizationId,
      archivedAt: null,
      ...(status ? { status } : {}),
      ...(clientSearch(filters.texto) ? { client: clientSearch(filters.texto) } : {}),
    },
    select: SERVICE_CASE_SELECT,
    orderBy: { updatedAt: "desc" },
    take: take(filters.limite),
  });
  return jsonSafe({ items: rows.map(serviceCaseInfo) });
}

export async function getServiceCaseBrief(ctx: OrganizationContext, id: string) {
  requireView(ctx, "cases.view");
  const row = await prisma.serviceCase.findFirst({
    where: { id, organizationId: ctx.organizationId, archivedAt: null },
    select: SERVICE_CASE_SELECT,
  });
  if (!row) return null;
  const notes = await prisma.note.findMany({
    where: { organizationId: ctx.organizationId, serviceCaseId: id },
    select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return jsonSafe({
    ...serviceCaseInfo(row),
    notes: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, author: n.author.name })),
  });
}

// ── Tareas ─────────────────────────────────────────────────────────────────

export async function getTaskBrief(ctx: OrganizationContext, id: string) {
  requireView(ctx, "tasks.view");
  const row = await prisma.task.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      dueAt: true,
      completedAt: true,
      createdAt: true,
      client: { select: CLIENT_SELECT },
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!row) return null;
  return jsonSafe({
    ...row,
    client: row.client ? clientInfo(row.client) : null,
    assignedTo: row.assignedTo.name,
    createdBy: row.createdBy?.name ?? null,
    href: `/crm/tareas/${row.id}`,
  });
}

// ── Cotizaciones ───────────────────────────────────────────────────────────

export async function getQuoteBrief(ctx: OrganizationContext, id: string) {
  requireView(ctx, "quotes.view");
  const row = await prisma.quote.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true,
      folio: true,
      status: true,
      currency: true,
      issuedAt: true,
      validUntil: true,
      subtotal: true,
      discountTotal: true,
      taxAmount: true,
      total: true,
      notes: true,
      sentAt: true,
      acceptedAt: true,
      paidAt: true,
      client: { select: CLIENT_SELECT },
      items: {
        select: { description: true, quantity: true, unitPrice: true, total: true },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!row) return null;
  return jsonSafe({
    id: row.id,
    folio: row.folio,
    status: row.status,
    issuedAt: row.issuedAt,
    validUntil: row.validUntil,
    sentAt: row.sentAt,
    acceptedAt: row.acceptedAt,
    paidAt: row.paidAt,
    subtotal: formatMoney(row.subtotal, row.currency),
    discount: formatMoney(row.discountTotal, row.currency),
    tax: formatMoney(row.taxAmount, row.currency),
    total: formatMoney(row.total, row.currency),
    notes: row.notes,
    items: row.items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: formatMoney(i.unitPrice, row.currency),
      total: formatMoney(i.total, row.currency),
    })),
    client: clientInfo(row.client),
    href: `/crm/cotizaciones/${row.id}`,
  });
}
