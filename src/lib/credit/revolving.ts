/**
 * Utilización de revolving abierto e individual.
 * No fusiona una identidad que no esté confirmada ni promedia porcentajes.
 */

import { classifyAccountFamily, classifyOwnership } from "./normalize";

export const REVOLVING_VERSION = "t11-2026-10-20";
export const OPEN_STATUS_LABEL = "estado sin dato";
export const REVOLVING_SELECTION_POLICY = "t06-selection-2026-10-20";

export type AggregateStatus = "KNOWN" | "PARTIAL" | "NOT_APPLICABLE";

export type RevolvingObservation = {
  id: string;
  creditorName: string;
  bureau: string;
  accountType: string | null;
  responsibility: string | null;
  accountStatus: string | null;
  balanceCents: number | null;
  limitCents: number | null;
  currency: string | null;
  reportDate: string;
  canonicalId: string | null;
  identityStatus: "CONFIRMED" | "NONE";
};

export type RevolvingCard = {
  id: string;
  creditorName: string;
  bureau: string;
  balanceCents: number | null;
  limitCents: number | null;
  rawBalanceCents: number | null;
  utilizationBps: number | null;
  currency: string | null;
  canonicalId: string | null;
  openKnown: boolean;
};

export type RevolvingAggregate = {
  status: AggregateStatus;
  balanceCents: number | null;
  limitCents: number | null;
  valueBps: number | null;
  knownSubsetBps: number | null;
  known: number;
  total: number;
  maxIndividualBps: number | null;
  currency: string | null;
};

export type RevolvingDiscrepancy = {
  code:
    | "UNCONFIRMED_IDENTITY"
    | "BUREAU_DIVERGENCE"
    | "MIXED_CURRENCY"
    | "CREDIT_BALANCE"
    | "OPEN_STATUS_UNKNOWN";
  observationIds: string[];
};

export type OwnershipSubtotals = {
  JOINT: RevolvingAggregate;
  AUTHORIZED_USER: RevolvingAggregate;
  UNKNOWN: RevolvingAggregate;
};

export type RevolvingScope = {
  individual: RevolvingAggregate;
  subtotals: OwnershipSubtotals;
  cards: RevolvingCard[];
};

export type RevolvingReading = {
  version: string;
  asOf: string;
  selectionPolicyVersion: string;
  bureaus: Array<RevolvingScope & { bureau: string }>;
  consolidated: RevolvingScope & { discrepancies: RevolvingDiscrepancy[] };
};

const BUREAUS = ["EXPERIAN", "EQUIFAX", "TRANSUNION"] as const;

function money(value: number | null): value is number {
  return value != null && Number.isSafeInteger(value) && value >= 0;
}

/** Puntos básicos. No recorta por encima de 100%. Un límite ausente o cero no divide. */
export function utilizationBps(balance: number | null, limit: number | null): number | null {
  if (!money(balance) || !money(limit) || limit === 0) return null;
  const rounded = (BigInt(balance) * 10000n * 2n + BigInt(limit)) / (2n * BigInt(limit));
  return Number(rounded);
}

export function openStateOf(status: string | null | undefined): "OPEN" | "CLOSED" | "UNKNOWN" {
  const text = status?.trim() ?? "";
  if (text.length === 0) return "UNKNOWN";
  if (/\b(closed|cerrad)/i.test(text)) return "CLOSED";
  if (/\b(open|abiert[oa])\b/i.test(text)) return "OPEN";
  return "UNKNOWN";
}

/** Solo un abierto o cerrado explícito. Un rating de pago no abre la cuenta. */
export function openClosedForReading(
  openClosedStatus: string | null | undefined,
  accountStatus: string | null | undefined,
): string | null {
  const explicit = openClosedStatus?.trim() ?? "";
  if (explicit.length > 0) return explicit;
  const stored = accountStatus?.trim() ?? "";
  const state = openStateOf(stored);
  if (state === "OPEN" || state === "CLOSED") return stored;
  return null;
}

export function assignOpenClosed(input: {
  accountStatus?: string | null;
  paymentStatus?: string | null;
  openClosedStatus?: string | null;
}): { paymentStatus: string | null; openClosedStatus: string | null } {
  const account = input.accountStatus?.trim() || null;
  const payment = input.paymentStatus?.trim() || null;
  const explicit = input.openClosedStatus?.trim() || null;
  if (explicit) return { openClosedStatus: explicit, paymentStatus: payment };
  const state = openStateOf(account);
  if (state === "OPEN" || state === "CLOSED") {
    return { openClosedStatus: account, paymentStatus: payment };
  }
  if (account && !payment) return { openClosedStatus: null, paymentStatus: account };
  return { openClosedStatus: null, paymentStatus: payment };
}

export function isRevolvingAccount(accountType: string | null): boolean {
  return classifyAccountFamily(accountType, "revolving").value === "REVOLVING";
}

function ownershipOf(responsibility: string | null): "INDIVIDUAL" | "JOINT" | "AUTHORIZED_USER" | "UNKNOWN" {
  const value = classifyOwnership(responsibility, "revolving").ownership.value;
  if (value === "INDIVIDUAL" || value === "JOINT" || value === "AUTHORIZED_USER") return value;
  return "UNKNOWN";
}

function isRevolving(accountType: string | null): boolean {
  return isRevolvingAccount(accountType);
}

function emptyAggregate(): RevolvingAggregate {
  return {
    status: "NOT_APPLICABLE",
    balanceCents: null,
    limitCents: null,
    valueBps: null,
    knownSubsetBps: null,
    known: 0,
    total: 0,
    maxIndividualBps: null,
    currency: null,
  };
}

function selectLatest<T extends { id: string; reportDate: string }>(items: readonly T[], asOf: string): T | null {
  const eligible = items.filter((item) => item.reportDate <= asOf);
  if (eligible.length === 0) return null;
  return eligible.sort((left, right) => {
    if (left.reportDate !== right.reportDate) return left.reportDate < right.reportDate ? 1 : -1;
    return left.id < right.id ? 1 : -1;
  })[0]!;
}

function toCard(item: RevolvingObservation): RevolvingCard {
  const openKnown = openStateOf(item.accountStatus) === "OPEN";
  return {
    id: item.id,
    creditorName: item.creditorName,
    bureau: item.bureau,
    balanceCents: money(item.balanceCents) ? item.balanceCents : null,
    limitCents: money(item.limitCents) ? item.limitCents : null,
    rawBalanceCents: item.balanceCents,
    utilizationBps: openKnown ? utilizationBps(item.balanceCents, item.limitCents) : null,
    currency: item.currency,
    canonicalId: item.canonicalId,
    openKnown,
  };
}

function aggregateCards(cards: RevolvingCard[]): { aggregate: RevolvingAggregate; discrepancies: RevolvingDiscrepancy[] } {
  if (cards.length === 0) return { aggregate: emptyAggregate(), discrepancies: [] };
  const discrepancies: RevolvingDiscrepancy[] = [];
  const credit = cards.filter((card) => card.rawBalanceCents != null && card.rawBalanceCents < 0);
  if (credit.length > 0) {
    discrepancies.push({ code: "CREDIT_BALANCE", observationIds: credit.map((card) => card.id) });
  }
  const unknownOpen = cards.filter((card) => !card.openKnown);
  if (unknownOpen.length > 0) {
    discrepancies.push({
      code: "OPEN_STATUS_UNKNOWN",
      observationIds: unknownOpen.map((card) => card.id),
    });
  }
  const known = cards.filter((card) => card.utilizationBps != null);
  const currencies = new Set(known.map((card) => card.currency).filter((value): value is string => value != null && value.trim() !== ""));
  const missingCurrency = known.some((card) => card.currency == null || card.currency.trim() === "");
  const singleCurrency = currencies.size === 1 && !missingCurrency ? [...currencies][0]! : null;
  if (known.length > 0 && singleCurrency == null) {
    discrepancies.push({ code: "MIXED_CURRENCY", observationIds: known.map((card) => card.id) });
  }
  const summable = singleCurrency == null ? [] : known.filter((card) => card.currency === singleCurrency);
  const balance = summable.reduce((sum, card) => sum + card.balanceCents!, 0);
  const limit = summable.reduce((sum, card) => sum + card.limitCents!, 0);
  const complete = known.length === cards.length && singleCurrency != null;
  const status: AggregateStatus = summable.length === 0 ? (cards.length === 0 ? "NOT_APPLICABLE" : "PARTIAL") : complete ? "KNOWN" : "PARTIAL";
  const maxes = known.map((card) => card.utilizationBps).filter((value): value is number => value != null);
  return {
    aggregate: {
      status: cards.length === 0 ? "NOT_APPLICABLE" : status,
      balanceCents: summable.length > 0 ? balance : null,
      limitCents: summable.length > 0 ? limit : null,
      valueBps: status === "KNOWN" ? utilizationBps(balance, limit) : null,
      knownSubsetBps: summable.length > 0 ? utilizationBps(balance, limit) : null,
      known: summable.length,
      total: cards.length,
      maxIndividualBps: maxes.length > 0 ? Math.max(...maxes) : null,
      currency: singleCurrency,
    },
    discrepancies,
  };
}

function confirmed(item: RevolvingObservation): boolean {
  return item.identityStatus === "CONFIRMED" && item.canonicalId != null && item.canonicalId.trim() !== "";
}

function pickAccounts(
  items: readonly RevolvingObservation[],
  asOf: string,
  consolidate: boolean,
): { cards: RevolvingCard[]; discrepancies: RevolvingDiscrepancy[] } {
  const discrepancies: RevolvingDiscrepancy[] = [];
  const pending = items.filter((item) => !confirmed(item));
  const grouped = new Map<string, RevolvingObservation[]>();
  for (const item of items) {
    if (!confirmed(item)) continue;
    const key = item.canonicalId!;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const selected: RevolvingObservation[] = [];
  if (consolidate && pending.length > 0) {
    discrepancies.push({ code: "UNCONFIRMED_IDENTITY", observationIds: pending.map((item) => item.id) });
  }
  if (!consolidate) {
    for (const item of pending) selected.push(item);
  }
  for (const group of grouped.values()) {
    const chosen = selectLatest(group, asOf);
    if (chosen == null) continue;
    selected.push(chosen);
    const divergent = group.filter(
      (item) =>
        item.id !== chosen.id &&
        (item.balanceCents !== chosen.balanceCents || item.limitCents !== chosen.limitCents),
    );
    if (divergent.length > 0) {
      discrepancies.push({
        code: "BUREAU_DIVERGENCE",
        observationIds: [chosen.id, ...divergent.map((item) => item.id)],
      });
    }
  }
  return { cards: selected.map(toCard), discrepancies };
}

function scopeFor(
  items: readonly RevolvingObservation[],
  asOf: string,
  consolidate: boolean,
  ownership: "INDIVIDUAL" | "JOINT" | "AUTHORIZED_USER" | "UNKNOWN",
): { aggregate: RevolvingAggregate; cards: RevolvingCard[]; discrepancies: RevolvingDiscrepancy[] } {
  const matching = items.filter(
    (item) =>
      isRevolving(item.accountType) &&
      openStateOf(item.accountStatus) !== "CLOSED" &&
      ownershipOf(item.responsibility) === ownership,
  );
  const picked = pickAccounts(matching, asOf, consolidate);
  const summed = aggregateCards(picked.cards);
  return {
    aggregate: summed.aggregate,
    cards: picked.cards,
    discrepancies: [...picked.discrepancies, ...summed.discrepancies],
  };
}

function readingScope(
  items: readonly RevolvingObservation[],
  asOf: string,
  consolidate: boolean,
): RevolvingScope & { discrepancies: RevolvingDiscrepancy[] } {
  const individual = scopeFor(items, asOf, consolidate, "INDIVIDUAL");
  return {
    individual: individual.aggregate,
    subtotals: {
      JOINT: scopeFor(items, asOf, consolidate, "JOINT").aggregate,
      AUTHORIZED_USER: scopeFor(items, asOf, consolidate, "AUTHORIZED_USER").aggregate,
      UNKNOWN: scopeFor(items, asOf, consolidate, "UNKNOWN").aggregate,
    },
    cards: individual.cards,
    discrepancies: individual.discrepancies,
  };
}

export function buildRevolvingReading(input: {
  asOf: string;
  observations: readonly RevolvingObservation[];
}): RevolvingReading {
  const ids = input.observations.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_OBSERVATION");
  const bureaus = BUREAUS.map((bureau) => {
    const scope = readingScope(
      input.observations.filter((item) => item.bureau === bureau),
      input.asOf,
      false,
    );
    return { bureau, individual: scope.individual, subtotals: scope.subtotals, cards: scope.cards };
  });
  const consolidated = readingScope(input.observations, input.asOf, true);
  return {
    version: REVOLVING_VERSION,
    asOf: input.asOf,
    selectionPolicyVersion: REVOLVING_SELECTION_POLICY,
    bureaus,
    consolidated: {
      individual: consolidated.individual,
      subtotals: consolidated.subtotals,
      cards: consolidated.cards,
      discrepancies: consolidated.discrepancies,
    },
  };
}
