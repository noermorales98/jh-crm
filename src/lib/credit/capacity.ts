/**
 * DTI y DSCR con datos documentados.
 * No infiere el ingreso del score ni convierte el ratio en un préstamo.
 */

export const CAPACITY_VERSION = "t21-2026-10-21";
export const CAPACITY_NOT_INFERRED =
  "Sin ingreso documentado. No se infiere del score ni se calcula un préstamo.";

export type CapacityAttestation = "DECLARED" | "DOCUMENTED" | "CONFIRMED";
export type CapacityCoverage = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type CapacityRuleResult = "PASS" | "FAIL" | "UNKNOWN";

export type CapacityDocument = {
  id: string;
  clientId: string;
  organizationId: string;
  revoked: boolean;
};

export type DebtObligation = {
  canonicalId: string | null;
  identityConfirmed: boolean;
  authorizedUser: boolean;
  paymentCents: number | null;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type CapacityInput = {
  clientId: string;
  organizationId: string;
  canViewSensitive: boolean;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  grossMonthlyIncomeCents: number | null;
  debtCoverage: CapacityCoverage;
  obligations: readonly DebtObligation[];
  sourceDocumentIds: readonly string[];
  documents: readonly CapacityDocument[];
  reviewState: "PROPOSED" | "CONFIRMED";
  eligibleFlowCents: number | null;
  debtServiceCents: number | null;
  flowPeriodStart: string | null;
  flowPeriodEnd: string | null;
  flowCurrency: string | null;
  serviceCurrency: string | null;
  allowNegativeFlow: boolean;
};

export type CapacityReading = {
  version: typeof CAPACITY_VERSION;
  attestation: CapacityAttestation;
  dtiBps: number | null;
  dscrMilli: number | null;
  debtCoverage: CapacityCoverage;
  loanAmountCents: null;
  blocked: "DOCUMENT" | "SENSITIVE" | null;
};

export type CapacityRule = {
  operator: "MAX_DTI_BPS" | "MIN_DSCR_MILLI";
  threshold: number | null;
};

export function assessCapacity(input: CapacityInput): CapacityReading {
  const documentsOk = documentsAllowed(input);
  const attestation = attestationFor(input, documentsOk);
  const debt = sumDebt(input);
  const publish = input.canViewSensitive && documentsOk && attestation === "CONFIRMED";
  return {
    version: CAPACITY_VERSION,
    attestation,
    dtiBps: publish ? dtiBps(input, debt) : null,
    dscrMilli: publish ? dscrMilli(input) : null,
    debtCoverage: debt.coverage,
    loanAmountCents: null,
    blocked: !documentsOk ? "DOCUMENT" : input.canViewSensitive ? null : "SENSITIVE",
  };
}

export function assessCapacityRule(
  reading: CapacityReading,
  rule: CapacityRule,
): { result: CapacityRuleResult; loanAmountCents: null } {
  if (!Number.isInteger(rule.threshold)) return { result: "UNKNOWN", loanAmountCents: null };
  const threshold = rule.threshold ?? 0;
  if (rule.operator === "MAX_DTI_BPS") {
    if (reading.dtiBps == null) return { result: "UNKNOWN", loanAmountCents: null };
    return { result: reading.dtiBps <= threshold ? "PASS" : "FAIL", loanAmountCents: null };
  }
  if (reading.dscrMilli == null) return { result: "UNKNOWN", loanAmountCents: null };
  return { result: reading.dscrMilli >= threshold ? "PASS" : "FAIL", loanAmountCents: null };
}

function dtiBps(input: CapacityInput, debt: { cents: number | null; coverage: CapacityCoverage }): number | null {
  if (debt.coverage !== "COMPLETE" || debt.cents == null) return null;
  const income = knownCents(input.grossMonthlyIncomeCents);
  const currency = present(input.currency);
  if (income == null || income <= 0 || currency == null) return null;
  if (!samePeriod(input.periodStart, input.periodEnd)) return null;
  return Number((BigInt(debt.cents) * 10000n) / BigInt(income));
}

function dscrMilli(input: CapacityInput): number | null {
  const flowCurrency = present(input.flowCurrency);
  const serviceCurrency = present(input.serviceCurrency);
  if (flowCurrency == null || serviceCurrency == null || flowCurrency !== serviceCurrency) return null;
  if (!samePeriod(input.flowPeriodStart, input.flowPeriodEnd)) return null;
  const flow = input.eligibleFlowCents;
  const service = input.debtServiceCents;
  if (flow == null || !Number.isInteger(flow) || service == null || !Number.isInteger(service) || service === 0) return null;
  if (flow < 0 && !input.allowNegativeFlow) return null;
  return Number((BigInt(flow) * 1000n) / BigInt(service));
}

function sumDebt(input: CapacityInput): { cents: number | null; coverage: CapacityCoverage } {
  if (input.debtCoverage !== "COMPLETE") return { cents: null, coverage: input.debtCoverage };
  const currency = present(input.currency);
  if (currency == null || !samePeriod(input.periodStart, input.periodEnd)) {
    return { cents: null, coverage: "UNKNOWN" };
  }
  const personal = input.obligations.filter((item) => !item.authorizedUser);
  if (personal.some((item) => !item.identityConfirmed || present(item.canonicalId) == null)) {
    return { cents: null, coverage: "PARTIAL" };
  }
  const groups = new Map<string, DebtObligation[]>();
  for (const item of personal) {
    const key = present(item.canonicalId)!;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  let total = 0;
  for (const items of groups.values()) {
    const payment = sharedPayment(items, currency, input.periodStart!, input.periodEnd!);
    if (payment == null) return { cents: null, coverage: "PARTIAL" };
    total += payment;
  }
  return { cents: total, coverage: "COMPLETE" };
}

function sharedPayment(
  items: readonly DebtObligation[],
  currency: string,
  periodStart: string,
  periodEnd: string,
): number | null {
  const first = items[0];
  if (!first) return null;
  const payment = knownCents(first.paymentCents);
  if (payment == null || payment < 0) return null;
  for (const item of items) {
    if (knownCents(item.paymentCents) !== payment) return null;
    if (present(item.currency)?.toUpperCase() !== currency.toUpperCase()) return null;
    if (item.periodStart !== periodStart || item.periodEnd !== periodEnd) return null;
  }
  return payment;
}

function documentsAllowed(input: CapacityInput): boolean {
  if (input.sourceDocumentIds.length === 0) return input.reviewState !== "CONFIRMED";
  return input.sourceDocumentIds.every((id) => {
    const document = input.documents.find((item) => item.id === id);
    if (!document || document.revoked) return false;
    return document.clientId === input.clientId && document.organizationId === input.organizationId;
  });
}

function attestationFor(input: CapacityInput, documentsOk: boolean): CapacityAttestation {
  const hasDocuments = input.sourceDocumentIds.length > 0 && documentsOk;
  if (hasDocuments && input.reviewState === "CONFIRMED") return "CONFIRMED";
  if (hasDocuments) return "DOCUMENTED";
  return "DECLARED";
}

function samePeriod(start: string | null, end: string | null): boolean {
  return isoDate(start) && isoDate(end) && start! <= end!;
}

function knownCents(value: number | null): number | null {
  return value != null && Number.isInteger(value) ? value : null;
}

function present(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text.length ? text : null;
}

function isoDate(value: string | null): boolean {
  return value != null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
