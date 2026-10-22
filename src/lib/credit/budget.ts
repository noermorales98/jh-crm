/**
 * Reparte un presupuesto extra que la persona declara.
 * No envía pagos, no modifica el reporte y no predice puntos.
 */

import type { AggregateStatus } from "./revolving";
import { utilizationBps } from "./revolving";
import { paydownCents } from "./score-plan";

export const BUDGET_VERSION = "t14-2026-10-21";
export const BUDGET_POLICY = "UTILIZATION_BUCKETS_V1" as const;
export const DEFAULT_BUCKETS_BPS = [10_000, 7_500, 5_000, 3_000, 1_000, 0];

export type BudgetAccount = {
  canonicalId: string;
  creditorName: string;
  balanceCents: number | null;
  limitCents: number | null;
  currency: string | null;
};

export type BudgetExclusionReason =
  | "MISSING_LIMIT"
  | "MISSING_BALANCE"
  | "MIXED_CURRENCY"
  | "DUPLICATE"
  | "AGGREGATE_NOT_KNOWN";

export type BudgetAllocation = {
  policy: typeof BUDGET_POLICY;
  version: typeof BUDGET_VERSION;
  beforeSnapshotId: string;
  extraBudgetCents: number;
  simulated: true;
  complete: boolean;
  spentCents: number | null;
  remainingCents: number | null;
  simulatedUtilizationBps: number | null;
  cards: {
    canonicalId: string;
    creditorName: string;
    paymentCents: number;
    balanceCents: number;
    limitCents: number;
  }[];
  excluded: {
    canonicalId: string;
    creditorName: string;
    reason: BudgetExclusionReason;
  }[];
};

type WorkingCard = {
  canonicalId: string;
  creditorName: string;
  balance: number;
  limit: number;
  payment: number;
};

function money(value: number | null): value is number {
  return value != null && Number.isSafeInteger(value) && value >= 0;
}

function targetValid(targetBps: number): boolean {
  return Number.isInteger(targetBps) && targetBps >= 0 && targetBps <= 10_000;
}

function blank(result: Omit<BudgetAllocation, "cards" | "excluded" | "complete" | "spentCents" | "remainingCents" | "simulatedUtilizationBps"> & {
  complete: boolean;
  spentCents: number | null;
  remainingCents: number | null;
  simulatedUtilizationBps: number | null;
  excluded?: BudgetAllocation["excluded"];
}): BudgetAllocation {
  return { ...result, cards: [], excluded: result.excluded ?? [] };
}

/** Dólares escritos por la persona. Vacío no es cero. */
export function parseExtraBudgetCents(raw: string): number | null {
  const text = raw.trim().replace(/[$,\s]/g, "");
  if (text === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function budgetExclusionLabel(reason: BudgetExclusionReason): string {
  switch (reason) {
    case "MISSING_LIMIT":
      return "Sin límite";
    case "MISSING_BALANCE":
      return "Sin saldo";
    case "MIXED_CURRENCY":
      return "Moneda distinta";
    case "DUPLICATE":
      return "Cuenta repetida";
    case "AGGREGATE_NOT_KNOWN":
      return "Agregado no conocido";
  }
}

export function allocateUtilizationBudget(input: {
  snapshotId: string;
  extraBudgetCents: number;
  aggregateStatus: AggregateStatus;
  accounts: readonly BudgetAccount[];
  bucketsBps?: readonly number[];
}): BudgetAllocation {
  const bucketsBps = input.bucketsBps ?? DEFAULT_BUCKETS_BPS;
  const base = {
    policy: BUDGET_POLICY,
    version: BUDGET_VERSION,
    beforeSnapshotId: input.snapshotId,
    extraBudgetCents: input.extraBudgetCents,
    simulated: true as const,
  };
  if (!money(input.extraBudgetCents) || bucketsBps.some((bucket) => !targetValid(bucket))) {
    return blank({ ...base, complete: false, spentCents: null, remainingCents: null, simulatedUtilizationBps: null });
  }
  if (input.accounts.length === 0) {
    return blank({
      ...base,
      complete: true,
      spentCents: 0,
      remainingCents: input.extraBudgetCents,
      simulatedUtilizationBps: null,
    });
  }

  const seen = new Map<string, number>();
  for (const account of input.accounts) {
    seen.set(account.canonicalId, (seen.get(account.canonicalId) ?? 0) + 1);
  }
  const sharedCurrency = input.accounts.every(
    (account) =>
      account.currency != null &&
      account.currency.trim() !== "" &&
      account.currency === input.accounts[0]?.currency,
  );
  const excluded: BudgetAllocation["excluded"] = [];
  for (const account of input.accounts) {
    const reason = exclusionReason(account, (seen.get(account.canonicalId) ?? 0) > 1, sharedCurrency, input.aggregateStatus);
    if (reason) {
      excluded.push({
        canonicalId: account.canonicalId,
        creditorName: account.creditorName,
        reason,
      });
    }
  }
  if (excluded.length > 0 || input.aggregateStatus !== "KNOWN") {
    return blank({
      ...base,
      complete: false,
      spentCents: null,
      remainingCents: null,
      simulatedUtilizationBps: null,
      excluded,
    });
  }

  const working: WorkingCard[] = input.accounts.map((account) => ({
    canonicalId: account.canonicalId,
    creditorName: account.creditorName,
    balance: account.balanceCents ?? 0,
    limit: account.limitCents ?? 0,
    payment: 0,
  }));
  const buckets = [...new Set([...bucketsBps, 0])].sort((left, right) => right - left);
  let remaining = input.extraBudgetCents;
  while (remaining > 0) {
    const active = working
      .filter((card) => card.balance > 0)
      .sort((left, right) => {
        const cross = BigInt(left.balance) * BigInt(right.limit) - BigInt(right.balance) * BigInt(left.limit);
        if (cross > 0n) return -1;
        if (cross < 0n) return 1;
        if (left.canonicalId < right.canonicalId) return -1;
        if (left.canonicalId > right.canonicalId) return 1;
        return 0;
      });
    const card = active[0];
    if (!card) break;
    const target = buckets.find(
      (bucket) => BigInt(card.balance) * 10_000n > BigInt(card.limit) * BigInt(bucket),
    );
    if (target == null) break;
    const needed = paydownCents(card.balance, card.limit, target);
    if (needed == null || needed <= 0) break;
    const payment = Math.min(remaining, card.balance, needed);
    if (payment <= 0) break;
    card.balance -= payment;
    card.payment += payment;
    remaining -= payment;
  }
  const spent = input.extraBudgetCents - remaining;
  const simulatedUtilizationBps = utilizationBps(
    working.reduce((sum, card) => sum + card.balance, 0),
    working.reduce((sum, card) => sum + card.limit, 0),
  );
  return {
    ...base,
    complete: true,
    spentCents: spent,
    remainingCents: remaining,
    simulatedUtilizationBps,
    cards: working.map((card) => ({
      canonicalId: card.canonicalId,
      creditorName: card.creditorName,
      paymentCents: card.payment,
      balanceCents: card.balance,
      limitCents: card.limit,
    })),
    excluded: [],
  };
}

function exclusionReason(
  account: BudgetAccount,
  duplicate: boolean,
  sharedCurrency: boolean,
  aggregateStatus: AggregateStatus,
): BudgetExclusionReason | null {
  if (duplicate) return "DUPLICATE";
  if (!money(account.balanceCents)) return "MISSING_BALANCE";
  if (!money(account.limitCents) || account.limitCents === 0) return "MISSING_LIMIT";
  if (!sharedCurrency) return "MIXED_CURRENCY";
  if (aggregateStatus !== "KNOWN") return "AGGREGATE_NOT_KNOWN";
  return null;
}
