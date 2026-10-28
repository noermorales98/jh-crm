import type { CreditBureau, CreditNegativeType } from "@prisma/client";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import {
  ACTION_PLAN_HOWTO,
  type ActionPlanHowTo,
  type ActionPlanPriorityId,
} from "@/src/lib/credit/action-plan-howto";
import { buildCreditActions, type CreditAction } from "@/src/lib/credit/actions";
import { FUNDING_ESTIMATE_MESSAGE } from "@/src/lib/credit/funding-estimate";
import { buildOwnershipSummary, AU_LIMIT_NOT_CAPACITY } from "@/src/lib/credit/ownership";
import {
  buildAnomalyReading,
  type CreditAnomaly,
} from "@/src/lib/credit/anomalies";
import { selectActionPlanReport } from "@/src/lib/credit/report-selection";
import {
  INQUIRY_WINDOW_MONTHS,
  averageAgeMonths,
  inquiriesInWindow,
  practicalCards,
  practicalNegatives,
  totalUtilizationBps,
  type PracticalItem,
} from "@/src/lib/credit/practical";
import { metricText, presentUtilization } from "@/src/lib/credit/metrics-view";
import {
  OPEN_STATUS_LABEL,
  buildRevolvingReading,
  isRevolvingAccount,
  openClosedForReading,
  openStateOf,
} from "@/src/lib/credit/revolving";
import {
  type CivilDate,
} from "@/src/lib/credit/temporal";
async function loadReport(ctx: OrganizationContext, reportId: string) {
  const report = await prisma.creditReport.findFirst({
    where: { id: reportId, organizationId: ctx.organizationId },
    include: {
      snapshots: { orderBy: { bureau: "asc" as const } },
      items: {
        orderBy: [{ isNegative: "desc" as const }, { creditorName: "asc" }],
      },
    },
  });
  if (!report) throw new DomainError("Reporte de crédito no encontrado.");
  return report;
}

const BUREAUS: CreditBureau[] = ["EQUIFAX", "EXPERIAN", "TRANSUNION"];
const SCORE_MIN = 720;
const UTIL_MAX = 10;
const AGE_MONTHS_MIN = 30;
const COMBINED_LIMIT_TARGET = 40_000;

export type BureauMetric = {
  bureau: CreditBureau;
  score: number | null;
  utilization: number | null;
  utilizationBps: number | null;
  utilizationStatus: "KNOWN" | "PARTIAL" | "NOT_APPLICABLE";
  utilizationText: string;
  /** bureau = resumen oficial del buró; accounts = calculada con sus tarjetas. */
  utilizationSource: "bureau" | "accounts" | "summary";
  inquiries: number | null;
  /** De dónde sale el conteo de consultas (ventana o resumen del PDF). */
  inquiriesNote: string | null;
  /** Negativos reportados por este buró. */
  negatives: number;
  /** Negativos que bloquean fondeo (excluye atrasos de más de 3 años). */
  blockingNegatives: number;
  /** Edad promedio (meses) de cuentas abiertas con fecha de apertura. */
  avgAgeMonths: number | null;
  scoreOk: boolean;
  utilOk: boolean;
  scoreLabel: string;
  utilLabel: string;
};

export type RevolvingCard = {
  creditorName: string;
  bureau: CreditBureau;
  limit: number | null;
  balance: number | null;
  currency: string | null;
  utilization: number | null;
  utilizationBps: number | null;
  openStatusUnknown: boolean;
};

export type ActionPlanPriority = ActionPlanHowTo & {
  active: boolean;
};

export type ClientActionPlan = {
  clientId: string;
  clientName: string;
  /** Estado (dirección) del cliente, p. ej. "IL". */
  clientState: string | null;
  reportId: string;
  caseId: string;
  reportDate: Date;
  newerIncompleteReport: boolean;
  bureaus: BureauMetric[];
  avgScore: number | null;
  avgUtilization: number | null;
  revolving: {
    openCards: number | null;
    primaryCards: number | null;
    auCards: number;
    totalLimit: number | null;
    totalUsed: number | null;
    utilPct: number | null;
    utilizationBps: number | null;
    currency: string | null;
    coverageLabel: string;
    aggregateStatus: "KNOWN" | "PARTIAL" | "NOT_APPLICABLE";
    scenarioAccounts: {
      canonicalId: string;
      creditorName: string;
      balanceCents: number | null;
      limitCents: number | null;
      currency: string | null;
    }[];
    cardsGe2k: number;
    cardsGe5k: number;
    cards: RevolvingCard[];
  };
  fundingMatrix: {
    bureau: CreditBureau;
    scoreOk: boolean;
    noNegatives: boolean | null;
    utilOk: boolean;
    /** null = sin dato de apertura en el reporte */
    ageOk: boolean | null;
    inquiryDisplay: string;
    structureOk: boolean | null;
    combinedLimitOk: boolean | null;
    allOk: boolean;
  }[];
  bureausApproved: number;
  qualified: boolean;
  verdict: string;
  priorities: ActionPlanPriority[];
  actions: CreditAction[];
    negativeCount: number;
  /** Cuentas negativas del reporte (para disputa), con fechas del reporte. */
  negativeAccounts: {
    id: string;
    creditorName: string;
    bureau: CreditBureau;
    negativeType: CreditNegativeType | null;
    accountStatus: string | null;
    balance: number | null;
    dateOpened: Date | null;
    dateReported: Date | null;
    /** Atraso de más de 3 años: no bloquea fondeo. */
    old: boolean;
  }[];
  totalItems: number;
  authorizedUsers: {
    confirmedCount: number;
    unresolvedCount: number;
    conflictCount: number;
    primaryBps: number | null;
    withAuthorizedUsersBps: number | null;
    note: string;
    accounts: {
      creditorName: string;
      bureaus: string[];
      ageMonths: number | null;
      balance: number | null;
      limit: number | null;
      utilization: number | null;
      accountStatus: string | null;
      reportedNegative: boolean;
      sourceReportDate: string;
    }[];
  };
};

function num(v: { toNumber?: () => number } | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v.toNumber === "function") return v.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function civilDay(value: Date | null | undefined): string {
  if (value == null || Number.isNaN(value.getTime())) return "";
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}-${day}`;
}

function civilDate(value: Date | null | undefined): CivilDate | null {
  if (value == null || Number.isNaN(value.getTime())) return null;
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    precision: "DAY",
  };
}


function toCents(value: { toNumber?: () => number } | number | null | undefined): number | null {
  const amount = num(value);
  if (amount == null) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function fromCents(cents: number | null): number | null {
  return cents == null ? null : cents / 100;
}

function labelScore(score: number | null): string {
  if (score == null) return "Sin dato";
  return "Referencia interna";
}

function labelUtil(util: number | null): string {
  if (util == null) return "Sin dato";
  return "Referencia interna";
}

/** Solo las prioridades que el reporte justifica (más relaciones bancarias). */
function pickPriorities(input: {
  hasChargeOff: boolean;
  hasCollections: boolean;
  hasLate: boolean;
  highUtil: boolean;
  cardsKnown: boolean;
  cardsGe5k: number;
  totalLimit: number | null;
}): ActionPlanPriority[] {
  const order: { id: ActionPlanPriorityId; active: boolean }[] = [
    { id: "charge_offs", active: input.hasChargeOff },
    { id: "collections", active: input.hasCollections },
    { id: "late_payments", active: input.hasLate },
    { id: "high_utilization", active: input.highUtil },
    { id: "no_high_limit", active: input.cardsKnown && input.cardsGe5k === 0 },
    {
      id: "combined_limit",
      active: input.totalLimit != null && input.totalLimit < COMBINED_LIMIT_TARGET,
    },
    { id: "bank_relationships", active: true },
  ];
  return order
    .filter((o) => o.active)
    .map((o) => ({ ...ACTION_PLAN_HOWTO[o.id], active: true }));
}

export async function selectClientActionPlanReport(
  ctx: OrganizationContext,
  clientId: string,
) {
  const candidates = await prisma.creditReport.findMany({
    where: { organizationId: ctx.organizationId, clientId },
    orderBy: [{ reportDate: "desc" }, { importedAt: "desc" }],
    select: {
      id: true,
      reportDate: true,
      importedAt: true,
      snapshots: { select: { id: true }, take: 1 },
      items: { select: { accountType: true, creditLimit: true } },
    },
  });
  const choice = selectActionPlanReport(
    candidates.map((candidate) => ({
      id: candidate.id,
      reportDate: candidate.reportDate.toISOString().slice(0, 10),
      importedAt: candidate.importedAt.toISOString(),
      hasSnapshot: candidate.snapshots.length > 0,
      hasItem: candidate.items.length > 0,
      usable: candidate.items.some(
        (item) =>
          (item.accountType?.trim().length ?? 0) > 0 || item.creditLimit != null,
      ),
    })),
  );
  return choice;
}

export async function getClientActionPlan(
  ctx: OrganizationContext,
  clientId: string,
  reportId?: string | null,
): Promise<ClientActionPlan> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
    select: { id: true, firstName: true, lastName: true, state: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  let resolvedReportId = reportId ?? null;
  let newerIncompleteReport = false;
  if (!resolvedReportId) {
    const choice = await selectClientActionPlanReport(ctx, clientId);
    resolvedReportId = choice.reportId;
    newerIncompleteReport = choice.newerIncomplete;
  }
  if (!resolvedReportId) {
    throw new DomainError("Sin reportes de crédito para este cliente.");
  }

  const report = await loadReport(ctx, resolvedReportId);
  if (report.clientId !== clientId) {
    throw new DomainError("Reporte no pertenece al cliente.");
  }

  const items = report.items;
  const negatives = items.filter((i) => i.isNegative);
  const reportAsOf = report.reportDate;
  const practicalItems: PracticalItem[] = items.map((item) => ({
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
  }));
  // Negativos reclasificados por el texto del reporte; un atraso viejo no bloquea.
  const classified = practicalNegatives(practicalItems, reportAsOf);
  const blocking = classified.filter((n) => !n.old);
  const negativesByBureau = new Map<CreditBureau, number>();
  const blockingByBureau = new Map<CreditBureau, number>();
  for (const b of BUREAUS) {
    negativesByBureau.set(b, classified.filter((n) => n.item.bureau === b).length);
    blockingByBureau.set(b, blocking.filter((n) => n.item.bureau === b).length);
  }
  const hasChargeOff = blocking.some((n) =>
    ["CHARGE_OFF", "REPOSSESSION", "FORECLOSURE", "BANKRUPTCY"].includes(n.type),
  );
  const hasCollections = blocking.some((n) => n.type === "COLLECTION");
  const hasLate = blocking.some((n) => n.type === "LATE_PAYMENT");
  const practicalAll = practicalCards(practicalItems);
  const inquiryRows = await prisma.creditInquiry.findMany({
    where: { organizationId: ctx.organizationId, reportId: report.id },
    select: { bureau: true, inquiryDate: true },
  });

  const asOf = civilDay(report.reportDate);
  const observations = items.map((item) => ({
    id: item.id,
    creditorName: item.creditorName,
    bureau: item.bureau,
    accountType: item.accountType,
    responsibility: item.ownershipType,
    accountStatus: openClosedForReading(item.openClosedStatus, item.accountStatus),
    balanceCents: toCents(item.balance),
    limitCents: toCents(item.creditLimit),
    currency: null,
    reportDate: asOf,
    canonicalId: item.canonicalTradelineId,
    identityStatus: item.canonicalTradelineId ? ("CONFIRMED" as const) : ("NONE" as const),
    ownershipConfirmed: false,
    opened: civilDate(item.dateOpened),
    reportedNegative: item.isNegative,
  }));
  const reading = buildRevolvingReading({ asOf, observations });
  const ownership = buildOwnershipSummary({ asOf, observations });
  const certified = reading.consolidated.individual;
  const certifiedKnown = certified.status === "KNOWN";
  const cards: RevolvingCard[] = reading.bureaus.flatMap((bureau) =>
    bureau.cards.map((card) => ({
      creditorName: card.creditorName,
      bureau: card.bureau as CreditBureau,
      limit: fromCents(card.limitCents),
      balance: fromCents(card.rawBalanceCents),
      currency: card.currency,
      utilization: card.utilizationBps == null ? null : card.utilizationBps / 100,
      utilizationBps: card.utilizationBps,
      openStatusUnknown: !card.openKnown,
    })),
  );
  for (const item of observations) {
    if (!isRevolvingAccount(item.accountType) || openStateOf(item.accountStatus) !== "UNKNOWN") {
      continue;
    }
    const already = cards.some(
      (card) => card.bureau === item.bureau && card.creditorName === item.creditorName,
    );
    if (already) continue;
    cards.push({
      creditorName: item.creditorName,
      bureau: item.bureau as CreditBureau,
      limit: fromCents(item.limitCents),
      balance: fromCents(item.balanceCents),
      currency: null,
      utilization: null,
      utilizationBps: null,
      openStatusUnknown: true,
    });
  }
  // Sin lectura certificada: lectura práctica (tarjetas abiertas con límite,
  // una vez aunque salgan en varios burós; titular sin dato = principal).
  const practicalPrimary = practicalAll.filter((card) => !card.authorizedUser);
  const usePractical = !certifiedKnown && practicalPrimary.length > 0;
  const practicalBps = totalUtilizationBps(practicalPrimary);
  const openCards = certifiedKnown ? certified.total : usePractical ? practicalPrimary.length : null;
  const totalLimit = certifiedKnown
    ? fromCents(certified.limitCents)
    : usePractical
      ? practicalPrimary.reduce((sum, card) => sum + card.limit, 0)
      : null;
  const totalUsed = certifiedKnown
    ? fromCents(certified.balanceCents)
    : usePractical
      ? practicalPrimary.reduce((sum, card) => sum + card.balance, 0)
      : null;
  const totalBps = certifiedKnown ? certified.valueBps : usePractical ? practicalBps : null;
  const utilPct = totalBps != null ? totalBps / 100 : null;
  const cardsGe2k = certifiedKnown
    ? reading.consolidated.cards.filter((card) => (card.limitCents ?? 0) >= 200_000).length
    : practicalPrimary.filter((card) => card.limit >= 2_000).length;
  const cardsGe5k = certifiedKnown
    ? reading.consolidated.cards.filter((card) => (card.limitCents ?? 0) >= 500_000).length
    : practicalPrimary.filter((card) => card.limit >= 5_000).length;
  const auCards = Math.max(
    ownership.auCanonicalIds.length,
    practicalAll.filter((card) => card.authorizedUser).length,
  );
  const displayCards: RevolvingCard[] = usePractical
    ? practicalAll.map((card) => ({
        creditorName: card.creditorName,
        bureau: card.bureaus[0]!,
        limit: card.limit,
        balance: card.balance,
        currency: null,
        utilization: card.utilizationBps / 100,
        utilizationBps: card.utilizationBps,
        openStatusUnknown: false,
      }))
    : cards;
  const openUnknown =
    observations.some(
      (item) => isRevolvingAccount(item.accountType) && openStateOf(item.accountStatus) === "UNKNOWN",
    );
  const coverageLabel = usePractical
    ? "Estimada desde el reporte"
    : reading.consolidated.discrepancies.some((item) => item.code === "UNCONFIRMED_IDENTITY") &&
    !certifiedKnown
      ? "Identidad sin confirmar"
      : openUnknown && !certifiedKnown
        ? OPEN_STATUS_LABEL
        : certified.status === "KNOWN"
          ? "Conocida"
          : certified.status === "PARTIAL"
            ? `Parcial ${certified.known}/${certified.total}`
            : "Sin cuentas elegibles";

  const snapshotUtils = report.snapshots
    .map((s) => num(s.utilization))
    .filter((value): value is number => value != null);
  const officialSnapshots = snapshotUtils.length >= 2 && new Set(snapshotUtils).size > 1;
  const bureaus: BureauMetric[] = BUREAUS.map((bureau) => {
    const snap = report.snapshots.find((s) => s.bureau === bureau);
    const score = snap?.score ?? null;
    const revolvingBureau = reading.bureaus.find((item) => item.bureau === bureau)?.individual;
    const strictStatus = revolvingBureau?.status ?? "NOT_APPLICABLE";
    // Utilización del buró: certificada; si no, saldo/límite de sus tarjetas;
    // si no hay tarjetas con límite, el dato del resumen del PDF.
    const bureauBps =
      strictStatus === "KNOWN"
        ? (revolvingBureau?.valueBps ?? null)
        : totalUtilizationBps(
            practicalCards(practicalItems.filter((item) => item.bureau === bureau)).filter(
              (card) => !card.authorizedUser,
            ),
          );
    // El resumen oficial de cada buró manda cuando viene bien extraído (valores
    // distintos entre burós); si la IA copió el mismo valor, se usan las cuentas.
    const snapUtil = num(snap?.utilization);
    const officialBps = officialSnapshots && snapUtil != null ? Math.round(snapUtil * 100) : null;
    const chosenBps = officialBps ?? bureauBps;
    const status = chosenBps != null ? "KNOWN" : strictStatus;
    const utilization = chosenBps != null ? chosenBps / 100 : snapUtil;
    // Consultas: con fecha → últimos 6 meses del reporte; sin filas → resumen del PDF.
    const bureauInquiries = inquiryRows.filter((row) => row.bureau === bureau);
    const window = inquiriesInWindow(bureauInquiries, reportAsOf);
    const inquiries = bureauInquiries.length > 0 ? window.counted : (snap?.inquiries ?? null);
    const inquiriesNote =
      bureauInquiries.length === 0
        ? inquiries == null
          ? null
          : "total del reporte"
        : window.undated > 0
          ? `últimos ${INQUIRY_WINDOW_MONTHS} meses (+${window.undated} sin fecha)`
          : `últimos ${INQUIRY_WINDOW_MONTHS} meses`;
    const bureauOpenUnknown = observations.some(
      (item) =>
        item.bureau === bureau &&
        isRevolvingAccount(item.accountType) &&
        openStateOf(item.accountStatus) === "UNKNOWN",
    );
    return {
      bureau,
      score,
      utilization,
      utilizationBps: chosenBps,
      utilizationStatus: status,
      utilizationSource: officialBps != null ? "bureau" : bureauBps != null ? "accounts" : "summary",
      utilizationText:
        chosenBps != null
          ? metricText(presentUtilization({ basisPoints: chosenBps, status: "KNOWN" }))
          : utilization != null
            ? `${utilization}%`
            : bureauOpenUnknown
              ? OPEN_STATUS_LABEL
              : metricText(presentUtilization({ basisPoints: null, status: "UNKNOWN" })),
      inquiries,
      inquiriesNote,
      negatives: negativesByBureau.get(bureau) ?? 0,
      blockingNegatives: blockingByBureau.get(bureau) ?? 0,
      avgAgeMonths: averageAgeMonths(
        practicalItems.filter((item) => item.bureau === bureau),
        reportAsOf,
      ),
      scoreOk: score != null && score >= SCORE_MIN,
      utilOk: utilization != null && utilization <= UTIL_MAX,
      scoreLabel: labelScore(score),
      utilLabel: labelUtil(utilization),
    };
  });

  const scores = bureaus.map((b) => b.score).filter((s): s is number => s != null);
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  const avgUtilization = utilPct;

  const structureOk =
    (certifiedKnown || usePractical) && openCards != null
      ? openCards >= 3 && cardsGe2k >= 1 && cardsGe5k >= 1
      : null;
  const combinedLimitOk =
    (certifiedKnown || usePractical) && totalLimit != null
      ? totalLimit >= COMBINED_LIMIT_TARGET
      : null;

  const fundingMatrix = BUREAUS.map((bureau) => {
    const m = bureaus.find((b) => b.bureau === bureau)!;
    // Sin negativos que bloqueen (un atraso de más de 3 años no bloquea).
    const noNegatives = (blockingByBureau.get(bureau) ?? 0) === 0;
    const ageOk = m.avgAgeMonths == null ? null : m.avgAgeMonths >= AGE_MONTHS_MIN;
    const row = {
      bureau,
      scoreOk: m.scoreOk,
      noNegatives,
      utilOk: m.utilOk,
      ageOk,
      inquiryDisplay:
        m.inquiries == null ? "Sin dato" : `${m.inquiries}${m.inquiriesNote ? ` (${m.inquiriesNote})` : ""}`,
      structureOk,
      combinedLimitOk,
      allOk: false,
    };
    row.allOk =
      row.scoreOk &&
      row.noNegatives === true &&
      row.utilOk &&
      row.structureOk === true &&
      row.combinedLimitOk === true &&
      row.ageOk === true;
    return row;
  });

  const bureausApproved = fundingMatrix.filter((r) => r.allOk).length;
  const qualified = bureausApproved >= 1;
  const highUtil = bureaus.some(
    (bureau) => bureau.utilization != null && bureau.utilization > UTIL_MAX,
  );

  const priorities = pickPriorities({
    hasChargeOff,
    hasCollections,
    hasLate,
    highUtil: highUtil || (utilPct != null && utilPct > UTIL_MAX),
    cardsKnown: openCards != null,
    cardsGe5k,
    totalLimit,
  });
  const anomalyReading = buildAnomalyReading({
    coverage: "UNKNOWN",
    negativeCount: negatives.length,
    observations: items.map((item) => ({
      id: item.id,
      canonicalId: item.canonicalTradelineId,
      identityStatus: item.canonicalTradelineId ? ("CONFIRMED" as const) : ("NONE" as const),
      bureau: item.bureau,
      creditorName: item.creditorName,
      balanceCents: toCents(item.balance),
      dateReported: civilDay(item.dateReported) || null,
      responsibility: item.ownershipType,
      ownershipConfirmed: false,
      paymentStatus: item.paymentStatus,
      isNegative: item.isNegative,
      negativeType: item.negativeType,
    })),
  });
  const actions = buildCreditActions(
    {
      clientId,
      snapshotId: report.id,
      coverage: "UNKNOWN",
      missingFields: [],
      interviews: [],
      scenario: null,
      discrepancies: anomalyReading.anomalies.map((anomaly) => ({
        canonicalId: anomaly.canonicalId,
        observationIds: anomaly.observationIds,
      })),
      authorizedUsers: ownership.auCanonicalIds.map((canonicalId) => ({
        canonicalId,
        observationIds: observations
          .filter((item) => item.canonicalId === canonicalId)
          .map((item) => item.id),
      })),
    },
    [],
  );

  const clientName = [client.firstName, client.lastName]
    .filter(Boolean)
    .join(" ");

  return {
    clientId,
    clientName,
    clientState: client.state,
    reportId: report.id,
    caseId: report.caseId,
    reportDate: report.reportDate,
    newerIncompleteReport,
    bureaus,
    avgScore,
    avgUtilization,
    revolving: {
      openCards,
      primaryCards: openCards,
      auCards,
      totalLimit,
      totalUsed,
      utilPct,
      utilizationBps: totalBps,
      currency: certified.currency,
      coverageLabel,
      aggregateStatus: usePractical ? "KNOWN" : certified.status,
      scenarioAccounts: reading.consolidated.cards.map((card) => ({
        canonicalId: card.canonicalId ?? card.id,
        creditorName: card.creditorName,
        balanceCents: card.balanceCents,
        limitCents: card.limitCents,
        currency: card.currency,
      })),
      cardsGe2k,
      cardsGe5k,
      cards: displayCards.slice(0, 20),
    },
    fundingMatrix,
    bureausApproved,
    qualified,
    verdict: FUNDING_ESTIMATE_MESSAGE,
    priorities,
    actions,
    negativeCount: classified.length,
    negativeAccounts: classified.slice(0, 60).map(({ item, type, old }) => ({
      id: item.id,
      creditorName: item.creditorName,
      bureau: item.bureau,
      negativeType: type,
      accountStatus: item.accountStatus ?? item.paymentStatus,
      balance: item.balance,
      dateOpened: item.dateOpened,
      dateReported: item.dateReported,
      old,
    })),
    totalItems: items.length,
    authorizedUsers: {
      confirmedCount: ownership.auCanonicalIds.length,
      unresolvedCount: ownership.unresolvedCanonicalIds.length,
      conflictCount: ownership.conflicts.length,
      primaryBps: ownership.primary.valueBps,
      withAuthorizedUsersBps: ownership.withAuthorizedUsers.valueBps,
      note: AU_LIMIT_NOT_CAPACITY,
      accounts: ownership.auAccounts.map((account) => ({
        creditorName: account.creditorName,
        bureaus: account.bureaus,
        ageMonths: account.ageMonths,
        balance: fromCents(account.balanceCents),
        limit: fromCents(account.limitCents),
        utilization: account.utilizationBps == null ? null : account.utilizationBps / 100,
        accountStatus: account.accountStatus,
        reportedNegative: account.reportedNegative,
        sourceReportDate: account.sourceReportDate,
      })),
    },
  };
}

export type NegativeAnalysisGroup = {
  key: string;
  title: string;
  description: string;
  count: number;
  items: {
    id: string;
    creditorName: string;
    bureau: CreditBureau;
    negativeType: CreditNegativeType | null;
    label: string;
  }[];
};

function looksLikePersonalData(item: {
  creditorName: string;
  accountType: string | null;
  accountStatus: string | null;
  remarks: string | null;
  paymentStatus: string | null;
}): boolean {
  const blob = [
    item.creditorName,
    item.accountType,
    item.accountStatus,
    item.remarks,
    item.paymentStatus,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    /\b(ssn|social security|date of birth|dob|address|nombre|dirección|empleo|employer|phone|teléfono|personal info|información personal|pii)\b/i.test(
      blob,
    ) || /\b(name variation|aka|also known)\b/i.test(blob)
  );
}

function toNegItem(i: {
  id: string;
  creditorName: string;
  bureau: CreditBureau;
  negativeType: CreditNegativeType | null;
}) {
  return {
    id: i.id,
    creditorName: i.creditorName,
    bureau: i.bureau,
    negativeType: i.negativeType,
    label: i.negativeType?.replace(/_/g, " ") ?? "NEGATIVO",
  };
}

export async function getClientNegativeAnalysis(
  ctx: OrganizationContext,
  clientId: string,
  reportId?: string | null,
) {
  const plan = await getClientActionPlan(ctx, clientId, reportId).catch(
    () => null,
  );
  if (!plan) {
    return {
      clientName: "",
      negativeCount: 0,
      totalItems: 0,
      negativeReading: "UNKNOWN" as const,
      anomalies: [] as CreditAnomaly[],
      groups: [] as NegativeAnalysisGroup[],
    };
  }

  const report = await loadReport(ctx, plan.reportId);
  const negatives = report.items.filter((i) => i.isNegative);

  const personal = negatives.filter((i) => looksLikePersonalData(i));
  const personalIds = new Set(personal.map((i) => i.id));
  const rest = negatives.filter((i) => !personalIds.has(i.id));

  const buckets: {
    key: string;
    title: string;
    description: string;
    types: CreditNegativeType[] | null;
    items: ReturnType<typeof toNegItem>[];
  }[] = [
    {
      key: "charge_off",
      title: "Cuentas castigadas (charge-off)",
      description:
        "El reporte clasifica la cuenta como charge-off, cobranza, reposesión o ejecución.",
      types: ["CHARGE_OFF", "COLLECTION", "REPOSSESSION", "FORECLOSURE"],
      items: [],
    },
    {
      key: "late",
      title: "Pagos tardíos",
      description: "El reporte marca pagos atrasados.",
      types: ["LATE_PAYMENT"],
      items: [],
    },
    {
      key: "personal_data",
      title: "Datos personales",
      description:
        "El reporte trae una marca sobre datos personales.",
      types: null,
      items: personal.map(toNegItem),
    },
    {
      key: "inquiry",
      title: "Consultas duras (inquiries)",
      description:
        "Solicitudes de crédito no conectadas a una cuenta abierta. Bajan el puntaje un poco y suman si son muchas.",
      types: ["HARD_INQUIRY"],
      items: [],
    },
    {
      key: "other",
      title: "Otros negativos",
      description: "Otras marcas negativas del reporte (p. ej. bancarrota).",
      types: ["BANKRUPTCY", "OTHER"],
      items: [],
    },
  ];

  for (const item of rest) {
    const bucket = buckets.find(
      (b) =>
        b.types != null &&
        item.negativeType != null &&
        b.types.includes(item.negativeType),
    );
    if (bucket) {
      bucket.items.push(toNegItem(item));
    } else {
      buckets.find((b) => b.key === "other")!.items.push(toNegItem(item));
    }
  }

  const groups: NegativeAnalysisGroup[] = buckets
    .map((b) => ({
      key: b.key,
      title: b.title,
      description: b.description,
      count: b.items.length,
      items: b.items,
    }))
    .filter((g) => g.count > 0);

  const reading = buildAnomalyReading({
    coverage: "UNKNOWN",
    negativeCount: negatives.length,
    observations: report.items.map((item) => ({
      id: item.id,
      canonicalId: item.canonicalTradelineId,
      identityStatus: item.canonicalTradelineId ? ("CONFIRMED" as const) : ("NONE" as const),
      bureau: item.bureau,
      creditorName: item.creditorName,
      balanceCents: toCents(item.balance),
      dateReported: civilDay(item.dateReported) || null,
      responsibility: item.ownershipType,
      ownershipConfirmed: false,
      paymentStatus: item.paymentStatus,
      isNegative: item.isNegative,
      negativeType: item.negativeType,
    })),
  });

  return {
    clientName: plan.clientName,
    negativeCount: plan.negativeCount,
    totalItems: plan.totalItems,
    negativeReading: reading.negativeReading,
    anomalies: reading.anomalies,
    groups,
  };
}

async function getOrgPdfInfo(organizationId: string) {
  const { loadPdfOrganization } = await import("@/src/server/pdf/org-info");
  const { info, timezone } = await loadPdfOrganization(organizationId);
  return { ...info, timezone };
}

/** PDF on-demand del Plan de Acción (staff). */
export async function buildClientActionPlanPdf(
  ctx: OrganizationContext,
  clientId: string,
  reportId?: string | null,
): Promise<{ pdf: Buffer; filename: string }> {
  const { generateActionPlanPdf } = await import("@/src/lib/pdf/action-plan");
  const { CREDIT_BUREAU_LABELS, CREDIT_NEGATIVE_TYPE_LABELS } = await import("@/src/lib/labels");
  const { ACTION_KIND_LABEL, ACTION_PRIORITY_LABEL } = await import("@/src/lib/credit/actions");
  const plan = await getClientActionPlan(ctx, clientId, reportId);
  const org = await getOrgPdfInfo(ctx.organizationId);
  const pdf = generateActionPlanPdf({
    organization: {
      legalName: org.legalName,
      phone: org.phone,
      email: org.email,
      website: org.website,
      addressLine: org.addressLine,
      logo: org.logo,
    },
    plan,
    bureauLabels: CREDIT_BUREAU_LABELS,
    negativeTypeLabels: CREDIT_NEGATIVE_TYPE_LABELS,
    actionKindLabels: ACTION_KIND_LABEL,
    actionPriorityLabels: ACTION_PRIORITY_LABEL,
    timezone: org.timezone,
  });
  const day = plan.reportDate.toISOString().slice(0, 10);
  const safeName = plan.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return {
    pdf,
    filename: `plan-accion-${safeName || "cliente"}-${day}.pdf`,
  };
}
