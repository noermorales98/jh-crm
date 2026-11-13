import type {
  ConsultationStatus,
  CreditReportType,
  DisputeLetterStatus,
  OpportunityStage,
  Prisma,
  RoundStatus,
  ServiceCaseStatus,
} from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { formatMoney } from "@/src/lib/format";
import { fullName, jsonSafe } from "@/src/lib/ai/serialize";
import { caseHref, creditAnalysisHref } from "@/src/lib/routes/case-routes";
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

// ── Rondas de disputa (con sus ítems) ──────────────────────────────────────

const ROUND_STATUSES: RoundStatus[] = [
  "DRAFT",
  "PREPARING",
  "SENT",
  "WAITING_UPDATE",
  "REVIEWING",
  "COMPLETED",
  "CANCELLED",
];
const LETTER_STATUSES: DisputeLetterStatus[] = ["DRAFT", "READY_FOR_REVIEW", "FINAL", "SENT", "CANCELLED"];
const REPORT_TYPES: CreditReportType[] = ["INITIAL", "UPDATE", "MANUAL"];
const CONSULTATION_STATUSES: ConsultationStatus[] = [
  "REQUESTED",
  "PAYMENT_PENDING",
  "PAID",
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
];

/** Nunca sale un número de cuenta completo: solo «****1234». */
function maskAccount(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `****${digits.slice(-4)}` : "****";
}

const CASE_REF_SELECT = {
  serviceCaseId: true,
  client: { select: CLIENT_SELECT },
} satisfies Prisma.CreditCaseSelect;

type CaseRef = { serviceCaseId: string; client: ClientRow };
function roundHref(ref: CaseRef, roundId: string) {
  return caseHref(ref.client.id, ref.serviceCaseId, `/rondas/${roundId}`);
}

const ROUND_SELECT = {
  id: true,
  roundNumber: true,
  status: true,
  startedAt: true,
  sentAt: true,
  expectedReviewAt: true,
  reviewedAt: true,
  lettersCount: true,
  disputedItemsCount: true,
  case: { select: CASE_REF_SELECT },
} satisfies Prisma.CreditRoundSelect;

type RoundRow = Prisma.CreditRoundGetPayload<{ select: typeof ROUND_SELECT }>;
function roundInfo(row: RoundRow) {
  return {
    id: row.id,
    roundNumber: row.roundNumber,
    status: row.status,
    startedAt: row.startedAt,
    sentAt: row.sentAt,
    expectedReviewAt: row.expectedReviewAt,
    reviewedAt: row.reviewedAt,
    lettersCount: row.lettersCount,
    disputedItemsCount: row.disputedItemsCount,
    client: clientInfo(row.case.client),
    href: roundHref(row.case, row.id),
  };
}

export async function listRounds(ctx: OrganizationContext, filters: ListFilters = {}) {
  requireView(ctx, "rounds.view");
  const status = pickEnum(filters.estado, ROUND_STATUSES, "Estado");
  const search = clientSearch(filters.texto);
  const rows = await prisma.creditRound.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(status ? { status } : {}),
      ...(search ? { case: { client: search } } : {}),
    },
    select: ROUND_SELECT,
    orderBy: { updatedAt: "desc" },
    take: take(filters.limite),
  });
  return jsonSafe({ items: rows.map(roundInfo) });
}

export async function getRoundDetail(ctx: OrganizationContext, id: string) {
  requireView(ctx, "rounds.view");
  const row = await prisma.creditRound.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { ...ROUND_SELECT, notes: true },
  });
  if (!row) return null;
  const canSeeDisputes = can(ctx.role, "disputes.view");
  const items = canSeeDisputes
    ? await prisma.disputeItem.findMany({
        where: { roundId: id, organizationId: ctx.organizationId },
        select: {
          id: true,
          targetKind: true,
          targetLabel: true,
          strategy: true,
          bureau: true,
          disputeReason: true,
          action: true,
          scope: true,
          method: true,
          status: true,
          outcome: true,
          creditItem: { select: { creditorName: true, accountNumberMasked: true } },
          inquiry: { select: { creditorName: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      })
    : [];
  return jsonSafe({
    ...roundInfo(row),
    notes: row.notes,
    disputeItems: items.map((i) => ({
      id: i.id,
      kind: i.targetKind,
      target: i.creditItem?.creditorName ?? i.inquiry?.creditorName ?? i.targetLabel,
      account: maskAccount(i.creditItem?.accountNumberMasked),
      bureau: i.bureau,
      reason: i.disputeReason,
      action: i.action,
      strategy: i.strategy,
      scope: i.scope,
      method: i.method,
      status: i.status,
      outcome: i.outcome,
    })),
  });
}

// ── Cartas de disputa ──────────────────────────────────────────────────────

const LETTER_SELECT = {
  id: true,
  bureau: true,
  recipient: true,
  subjectSnapshot: true,
  status: true,
  channel: true,
  strategy: true,
  generatedAt: true,
  finalizedAt: true,
  sentAt: true,
  trackingNumber: true,
  followUpAt: true,
  round: { select: { id: true, roundNumber: true, case: { select: CASE_REF_SELECT } } },
} satisfies Prisma.DisputeLetterSelect;

type LetterRow = Prisma.DisputeLetterGetPayload<{ select: typeof LETTER_SELECT }>;
function letterInfo(row: LetterRow) {
  return {
    id: row.id,
    bureau: row.bureau,
    recipient: row.recipient,
    subject: row.subjectSnapshot,
    status: row.status,
    channel: row.channel,
    strategy: row.strategy,
    generatedAt: row.generatedAt,
    finalizedAt: row.finalizedAt,
    sentAt: row.sentAt,
    trackingNumber: row.trackingNumber,
    followUpAt: row.followUpAt,
    round: { id: row.round.id, roundNumber: row.round.roundNumber },
    client: clientInfo(row.round.case.client),
    href: roundHref(row.round.case, row.round.id),
  };
}

export async function listLetters(ctx: OrganizationContext, filters: ListFilters = {}) {
  requireView(ctx, "letters.view");
  const status = pickEnum(filters.estado, LETTER_STATUSES, "Estado");
  const search = clientSearch(filters.texto);
  const rows = await prisma.disputeLetter.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(status ? { status } : {}),
      ...(search ? { round: { case: { client: search } } } : {}),
    },
    select: LETTER_SELECT,
    orderBy: { generatedAt: "desc" },
    take: take(filters.limite),
  });
  return jsonSafe({ items: rows.map(letterInfo) });
}

const LETTER_PREVIEW_CHARS = 1500;

export async function getLetterDetail(ctx: OrganizationContext, id: string) {
  requireView(ctx, "letters.view");
  const row = await prisma.disputeLetter.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { ...LETTER_SELECT, contentSnapshot: true, notes: true, items: { select: { disputeItemId: true } } },
  });
  if (!row) return null;
  return jsonSafe({
    ...letterInfo(row),
    disputeItemIds: row.items.map((i) => i.disputeItemId),
    contentPreview: row.contentSnapshot.slice(0, LETTER_PREVIEW_CHARS),
    contentTruncated: row.contentSnapshot.length > LETTER_PREVIEW_CHARS,
    notes: row.notes,
  });
}

// ── Reportes de crédito ────────────────────────────────────────────────────

const REPORT_SELECT = {
  id: true,
  type: true,
  provider: true,
  reportDate: true,
  importedAt: true,
  client: { select: CLIENT_SELECT },
  snapshots: {
    select: { bureau: true, score: true, totalAccounts: true, negativeAccounts: true, collections: true, inquiries: true },
  },
  _count: { select: { items: true } },
} satisfies Prisma.CreditReportSelect;

type ReportRow = Prisma.CreditReportGetPayload<{ select: typeof REPORT_SELECT }>;
function reportInfo(row: ReportRow) {
  return {
    id: row.id,
    type: row.type,
    provider: row.provider,
    reportDate: row.reportDate,
    importedAt: row.importedAt,
    itemCount: row._count.items,
    scores: row.snapshots.map((s) => ({
      bureau: s.bureau,
      score: s.score,
      totalAccounts: s.totalAccounts,
      negativeAccounts: s.negativeAccounts,
      collections: s.collections,
      inquiries: s.inquiries,
    })),
    client: clientInfo(row.client),
    href: creditAnalysisHref(row.id),
  };
}

export async function listCreditReports(ctx: OrganizationContext, filters: ListFilters = {}) {
  requireView(ctx, "creditReports.view");
  const type = pickEnum(filters.estado, REPORT_TYPES, "Tipo");
  const search = clientSearch(filters.texto);
  const rows = await prisma.creditReport.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(type ? { type } : {}),
      ...(search ? { client: search } : {}),
    },
    select: REPORT_SELECT,
    orderBy: { reportDate: "desc" },
    take: take(filters.limite),
  });
  return jsonSafe({ items: rows.map(reportInfo) });
}

export async function getCreditReportDetail(ctx: OrganizationContext, id: string) {
  requireView(ctx, "creditReports.view");
  const row = await prisma.creditReport.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { ...REPORT_SELECT, notes: true },
  });
  if (!row) return null;
  const [report, items] = await Promise.all([
    Promise.resolve(reportInfo(row)),
    prisma.creditItem.findMany({
      where: { reportId: id, organizationId: ctx.organizationId },
      select: {
        id: true,
        creditorName: true,
        accountNumberMasked: true,
        accountType: true,
        bureau: true,
        balance: true,
        accountStatus: true,
        paymentStatus: true,
        negativeType: true,
        isNegative: true,
        lifecycleStatus: true,
      },
      orderBy: [{ isNegative: "desc" }, { creditorName: "asc" }],
      take: 100,
    }),
  ]);
  return jsonSafe({
    ...report,
    notes: row.notes,
    items: items.map((i) => ({
      id: i.id,
      creditor: i.creditorName,
      account: maskAccount(i.accountNumberMasked),
      accountType: i.accountType,
      bureau: i.bureau,
      balance: i.balance ? formatMoney(i.balance, "USD") : null,
      accountStatus: i.accountStatus,
      paymentStatus: i.paymentStatus,
      negativeType: i.negativeType,
      isNegative: i.isNegative,
      lifecycleStatus: i.lifecycleStatus,
    })),
  });
}

// ── Consultas ──────────────────────────────────────────────────────────────

const CONSULTATION_SELECT = {
  id: true,
  status: true,
  amount: true,
  currency: true,
  scheduledAt: true,
  requestedAt: true,
  completedAt: true,
  client: { select: CLIENT_SELECT },
} satisfies Prisma.ConsultationSelect;

type ConsultationRow = Prisma.ConsultationGetPayload<{ select: typeof CONSULTATION_SELECT }>;
function consultationInfo(row: ConsultationRow) {
  return {
    id: row.id,
    status: row.status,
    amount: formatMoney(row.amount, row.currency),
    scheduledAt: row.scheduledAt,
    requestedAt: row.requestedAt,
    completedAt: row.completedAt,
    client: clientInfo(row.client),
    href: "/crm/consultas",
  };
}

export async function listConsultationsMcp(ctx: OrganizationContext, filters: ListFilters = {}) {
  requireView(ctx, "consultations.view");
  const status = pickEnum(filters.estado, CONSULTATION_STATUSES, "Estado");
  const search = clientSearch(filters.texto);
  const rows = await prisma.consultation.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(status ? { status } : {}),
      ...(search ? { client: search } : {}),
    },
    select: CONSULTATION_SELECT,
    orderBy: { requestedAt: "desc" },
    take: take(filters.limite),
  });
  return jsonSafe({ items: rows.map(consultationInfo), href: "/crm/consultas" });
}

export async function getConsultationDetail(ctx: OrganizationContext, id: string) {
  requireView(ctx, "consultations.view");
  const row = await prisma.consultation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { ...CONSULTATION_SELECT, notes: true },
  });
  if (!row) return null;
  return jsonSafe({ ...consultationInfo(row), notes: row.notes });
}
