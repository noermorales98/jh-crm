import type { CreditBureau, CreditNegativeType } from "@prisma/client";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import {
  ACTION_PLAN_HOWTO,
  type ActionPlanHowTo,
  type ActionPlanPriorityId,
} from "@/src/lib/credit/action-plan-howto";
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

const BUREAUS: CreditBureau[] = ["EXPERIAN", "EQUIFAX", "TRANSUNION"];
const SCORE_MIN = 720;
const UTIL_MAX = 10;
const INQUIRIES_MAX = 3;
const AGE_YEARS_MIN = 2.5;
const COMBINED_LIMIT_TARGET = 40_000;

export type BureauMetric = {
  bureau: CreditBureau;
  score: number | null;
  utilization: number | null;
  inquiries: number | null;
  scoreOk: boolean;
  utilOk: boolean;
  inquiriesOk: boolean;
  scoreLabel: string;
  utilLabel: string;
};

export type RevolvingCard = {
  creditorName: string;
  bureau: CreditBureau;
  limit: number | null;
  balance: number | null;
  utilization: number | null;
};

export type ActionPlanPriority = ActionPlanHowTo & {
  active: boolean;
};

export type ClientActionPlan = {
  clientId: string;
  clientName: string;
  reportId: string;
  reportDate: Date;
  bureaus: BureauMetric[];
  avgScore: number | null;
  avgUtilization: number | null;
  revolving: {
    openCards: number;
    primaryCards: number;
    auCards: number;
    totalLimit: number;
    totalUsed: number;
    utilPct: number | null;
    cardsGe2k: number;
    cardsGe5k: number;
    cards: RevolvingCard[];
  };
  fundingMatrix: {
    bureau: CreditBureau;
    scoreOk: boolean;
    noNegatives: boolean;
    utilOk: boolean;
    /** null = sin dato de apertura en el reporte */
    ageOk: boolean | null;
    inquiriesOk: boolean;
    structureOk: boolean;
    combinedLimitOk: boolean;
    allOk: boolean;
  }[];
  bureausApproved: number;
  qualified: boolean;
  verdict: string;
  priorities: ActionPlanPriority[];
  negativeCount: number;
  totalItems: number;
};

function num(v: { toNumber?: () => number } | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v.toNumber === "function") return v.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function labelScore(score: number | null): string {
  if (score == null) return "Sin dato";
  return score >= SCORE_MIN ? "Bueno" : "Necesita mejorar";
}

function labelUtil(util: number | null): string {
  if (util == null) return "Sin dato";
  return util <= UTIL_MAX ? "Bueno" : "Necesita mejorar";
}

function pickPriorities(input: {
  hasChargeOff: boolean;
  hasLate: boolean;
  highUtil: boolean;
  cardsGe5k: number;
  totalLimit: number;
}): ActionPlanPriority[] {
  const order: { id: ActionPlanPriorityId; active: boolean }[] = [
    { id: "charge_offs", active: input.hasChargeOff },
    { id: "late_payments", active: input.hasLate },
    { id: "high_utilization", active: input.highUtil },
    { id: "no_high_limit", active: input.cardsGe5k === 0 },
    {
      id: "combined_limit",
      active: input.totalLimit < COMBINED_LIMIT_TARGET,
    },
    { id: "bank_relationships", active: true },
  ];
  const active = order.filter((o) => o.active);
  const list = (active.length ? active : order).map((o) => ({
    ...ACTION_PLAN_HOWTO[o.id],
    active: o.active,
  }));
  return list;
}

export async function getClientActionPlan(
  ctx: OrganizationContext,
  clientId: string,
  reportId?: string | null,
): Promise<ClientActionPlan> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organizationId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  let resolvedReportId = reportId ?? null;
  if (!resolvedReportId) {
    const latest = await prisma.creditReport.findFirst({
      where: { organizationId: ctx.organizationId, clientId },
      orderBy: [{ reportDate: "desc" }, { importedAt: "desc" }],
      select: { id: true },
    });
    resolvedReportId = latest?.id ?? null;
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
  const hasChargeOff = negatives.some(
    (i) =>
      i.negativeType === "CHARGE_OFF" ||
      i.negativeType === "REPOSSESSION" ||
      i.negativeType === "COLLECTION",
  );
  const hasLate = negatives.some((i) => i.negativeType === "LATE_PAYMENT");
  const negativesByBureau = new Map<CreditBureau, number>();
  for (const b of BUREAUS) negativesByBureau.set(b, 0);
  for (const item of negatives) {
    negativesByBureau.set(
      item.bureau,
      (negativesByBureau.get(item.bureau) ?? 0) + 1,
    );
  }

  const revolvingItems = items.filter(
    (i) =>
      !i.isNegative ||
      i.accountType?.toLowerCase().includes("revolving") ||
      i.accountType?.toLowerCase().includes("credit card") ||
      (i.creditLimit != null && num(i.creditLimit)! > 0),
  );

  const cards: RevolvingCard[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const limit = num(item.creditLimit);
    const balance = num(item.balance);
    if (limit == null && balance == null) continue;
    const key = `${item.creditorName}|${item.bureau}|${limit}|${balance}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const util =
      limit != null && limit > 0 && balance != null
        ? (balance / limit) * 100
        : null;
    cards.push({
      creditorName: item.creditorName,
      bureau: item.bureau,
      limit,
      balance,
      utilization: util,
    });
  }

  const openCards = cards.length || revolvingItems.length;
  const totalLimit = cards.reduce((a, c) => a + (c.limit ?? 0), 0);
  const totalUsed = cards.reduce((a, c) => a + (c.balance ?? 0), 0);
  const utilPct = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : null;
  const cardsGe2k = cards.filter((c) => (c.limit ?? 0) >= 2000).length;
  const cardsGe5k = cards.filter((c) => (c.limit ?? 0) >= 5000).length;

  const bureaus: BureauMetric[] = BUREAUS.map((bureau) => {
    const snap = report.snapshots.find((s) => s.bureau === bureau);
    const score = snap?.score ?? null;
    const utilization = num(snap?.utilization);
    const inquiries = snap?.inquiries ?? null;
    return {
      bureau,
      score,
      utilization,
      inquiries,
      scoreOk: score != null && score >= SCORE_MIN,
      utilOk: utilization != null && utilization <= UTIL_MAX,
      inquiriesOk: inquiries != null && inquiries <= INQUIRIES_MAX,
      scoreLabel: labelScore(score),
      utilLabel: labelUtil(utilization),
    };
  });

  const scores = bureaus.map((b) => b.score).filter((s): s is number => s != null);
  const utils = bureaus
    .map((b) => b.utilization)
    .filter((u): u is number => u != null);
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  const avgUtilization =
    utils.length > 0
      ? Math.round(utils.reduce((a, b) => a + b, 0) / utils.length)
      : utilPct != null
        ? Math.round(utilPct)
        : null;

  const structureOk = openCards >= 3 && cardsGe2k >= 1 && cardsGe5k >= 1;
  const combinedLimitOk = totalLimit >= COMBINED_LIMIT_TARGET;

  function isAuthorizedUser(item: {
    accountType: string | null;
    accountStatus: string | null;
    remarks: string | null;
    creditorName: string;
  }): boolean {
    const blob = [
      item.accountType,
      item.accountStatus,
      item.remarks,
      item.creditorName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      /\b(authorized\s*user|usuario\s*autorizado|\bau\b|auth\.?\s*user)\b/i.test(
        blob,
      ) || blob.includes("authorized user")
    );
  }

  const auCards = items.filter((i) => isAuthorizedUser(i)).length;

  function ageYearsForBureau(bureau: CreditBureau): number | null {
    const opened = items
      .filter((i) => i.bureau === bureau && i.dateOpened != null)
      .map((i) => i.dateOpened!.getTime());
    if (opened.length === 0) return null;
    const oldest = Math.min(...opened);
    const years = (Date.now() - oldest) / (365.25 * 24 * 60 * 60 * 1000);
    return years;
  }

  const fundingMatrix = BUREAUS.map((bureau) => {
    const m = bureaus.find((b) => b.bureau === bureau)!;
    const noNegatives = (negativesByBureau.get(bureau) ?? 0) === 0;
    const ageYears = ageYearsForBureau(bureau);
    const ageOk =
      ageYears == null ? null : ageYears >= AGE_YEARS_MIN;
    const row = {
      bureau,
      scoreOk: m.scoreOk,
      noNegatives,
      utilOk: m.utilOk,
      ageOk,
      inquiriesOk: m.inquiriesOk,
      structureOk,
      combinedLimitOk,
      allOk: false,
    };
    row.allOk =
      row.scoreOk &&
      row.noNegatives &&
      row.utilOk &&
      row.inquiriesOk &&
      row.structureOk &&
      row.combinedLimitOk &&
      (row.ageOk === true || row.ageOk === null);
    return row;
  });

  const bureausApproved = fundingMatrix.filter((r) => r.allOk).length;
  const qualified = bureausApproved >= 1;
  const highUtil =
    (avgUtilization != null && avgUtilization > UTIL_MAX) ||
    bureaus.some((b) => b.utilization != null && b.utilization > UTIL_MAX);

  const priorities = pickPriorities({
    hasChargeOff,
    hasLate: hasLate || negatives.length > 0,
    highUtil,
    cardsGe5k,
    totalLimit,
  });

  const clientName = [client.firstName, client.lastName]
    .filter(Boolean)
    .join(" ");

  return {
    clientId,
    clientName,
    reportId: report.id,
    reportDate: report.reportDate,
    bureaus,
    avgScore,
    avgUtilization,
    revolving: {
      openCards,
      primaryCards: Math.max(0, openCards - auCards),
      auCards,
      totalLimit,
      totalUsed,
      utilPct,
      cardsGe2k,
      cardsGe5k,
      cards: cards.slice(0, 20),
    },
    fundingMatrix,
    bureausApproved,
    qualified,
    verdict: qualified
      ? "Tu perfil muestra señales de elegibilidad. Revisa la secuencia de financiamiento y confirma requisitos del prestamista."
      : "Tu perfil crediticio no califica actualmente para financiamiento. Sigue el plan de acción de la Sección 6 para mejorar tu elegibilidad.",
    priorities,
    negativeCount: negatives.length,
    totalItems: items.length,
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
        "El banco dio la cuenta por perdida. Marca muy negativa; los bancos la ven como impago grave.",
      types: ["CHARGE_OFF", "COLLECTION", "REPOSSESSION", "FORECLOSURE"],
      items: [],
    },
    {
      key: "late",
      title: "Pagos tardíos",
      description:
        "Pagos que se reportaron atrasados (30/60/90+ días). El historial de pagos es lo que más pesa en el puntaje.",
      types: ["LATE_PAYMENT"],
      items: [],
    },
    {
      key: "personal_data",
      title: "Datos personales",
      description:
        "Errores o discrepancias en nombre, dirección, SSN, empleo u otra información personal del reporte.",
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

  return {
    clientName: plan.clientName,
    negativeCount: plan.negativeCount,
    totalItems: plan.totalItems,
    groups,
  };
}

async function getOrgPdfInfo(organizationId: string) {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  const addressLine = [
    settings?.addressLine1,
    settings?.addressLine2,
    [settings?.city, settings?.state, settings?.postalCode]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(", ");
  return {
    legalName: settings?.legalName ?? "J&H Multiservices LLC",
    phone: settings?.phone,
    email: settings?.email,
    website: settings?.website,
    addressLine: addressLine || null,
    timezone: settings?.timezone ?? "America/Chicago",
  };
}

/** PDF on-demand del Plan de Acción (staff). */
export async function buildClientActionPlanPdf(
  ctx: OrganizationContext,
  clientId: string,
  reportId?: string | null,
): Promise<{ pdf: Buffer; filename: string }> {
  const { generateActionPlanPdf } = await import("@/src/lib/pdf/action-plan");
  const { CREDIT_BUREAU_LABELS } = await import("@/src/lib/labels");
  const plan = await getClientActionPlan(ctx, clientId, reportId);
  const org = await getOrgPdfInfo(ctx.organizationId);
  const pdf = generateActionPlanPdf({
    organization: {
      legalName: org.legalName,
      phone: org.phone,
      email: org.email,
      website: org.website,
      addressLine: org.addressLine,
    },
    clientName: plan.clientName,
    reportDate: plan.reportDate,
    timezone: org.timezone,
    qualified: plan.qualified,
    bureausApproved: plan.bureausApproved,
    verdict: plan.verdict,
    avgScore: plan.avgScore,
    avgUtilization: plan.avgUtilization,
    bureaus: plan.bureaus.map((b) => ({
      bureau: CREDIT_BUREAU_LABELS[b.bureau] ?? b.bureau,
      score: b.score,
      utilization: b.utilization,
      inquiries: b.inquiries,
    })),
    revolving: {
      openCards: plan.revolving.openCards,
      auCards: plan.revolving.auCards,
      totalLimit: plan.revolving.totalLimit,
      utilPct: plan.revolving.utilPct,
    },
    priorities: plan.priorities.map((p) => ({
      title: p.title,
      severity: p.severity,
      summary: p.summary,
      ficoImpact: p.ficoImpact,
      timeline: p.timeline,
    })),
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
