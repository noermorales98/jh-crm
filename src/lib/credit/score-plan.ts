/**
 * Escenarios de pago por tarjeta y del conjunto.
 * Solo calcula un monto cuando límite y saldo son conocidos.
 * No predice puntos ni consulta la base de datos.
 */

import { utilizationBps, type AggregateStatus } from "./revolving";

export const SCENARIO_VERSION = "t13-2026-10-21";
export const SCENARIO_DIFFERENCE =
  "El pago por tarjeta lleva cada cuenta a la meta. El del conjunto usa el saldo y el límite ya sumados, así que puede ser menor.";

export type ScorePlanAccount = {
  creditorName: string;
  limit: number | null;
  balance: number | null;
  utilization: number | null;
};

export type ScorePlanReadyRow = {
  kind: "ready";
  name: string;
  pct: number;
  amount: number;
};

export type ScorePlanInsufficientRow = {
  kind: "insufficient";
  name: string;
};

export type ScorePlanRow = ScorePlanReadyRow | ScorePlanInsufficientRow;

export const SCORE_PLAN_INSUFFICIENT_LABEL = "Datos insuficientes";

export const SCORE_PLAN_EMPTY_COPY =
  "Datos insuficientes para calcular montos a pagar.";

export const SCORE_PLAN_REVIEW_NOTE =
  "Estimaciones del reporte. Revísalas antes de compartirlas.";

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatScorePlanMoney(amount: number): string {
  return amount.toLocaleString("en-US");
}

function toCents(value: number): number | null {
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function buildScorePlan(
  accounts: ScorePlanAccount[],
  targetPct: number,
): ScorePlanRow[] {
  return accounts.map((account) => {
    const name = account.creditorName;
    const { limit, balance } = account;
    if (!isFiniteNumber(limit) || limit <= 0 || !isFiniteNumber(balance)) {
      return { kind: "insufficient", name };
    }
    const currentPct = utilizationBps(toCents(balance), toCents(limit));
    if (currentPct == null) {
      return { kind: "insufficient", name };
    }
    const payment = paydownCents(
      toCents(balance),
      toCents(limit),
      Math.round(targetPct * 100),
    );
    if (payment == null) return { kind: "insufficient", name };
    return {
      kind: "ready",
      name,
      pct: currentPct / 100,
      amount: payment / 100,
    };
  });
}

export function formatScorePlanCopy(
  rows: ScorePlanRow[],
  targetPct: number,
): string {
  const hasReady = rows.some((row) => row.kind === "ready");
  const body = !hasReady
    ? rows.length === 0
      ? SCORE_PLAN_EMPTY_COPY
      : rows
          .map((row) => `${row.name}: ${SCORE_PLAN_INSUFFICIENT_LABEL}`)
          .join("\n")
    : rows
        .map((row) => {
          if (row.kind === "insufficient") {
            return `${row.name}: ${SCORE_PLAN_INSUFFICIENT_LABEL}`;
          }
          return `${row.name}: ahora ${row.pct}% · $${formatScorePlanMoney(row.amount)} (meta ${targetPct}%)`;
        })
        .join("\n");
  return `${body}\n${SCORE_PLAN_REVIEW_NOTE}`;
}

export type ScenarioAccount = {
  canonicalId: string;
  creditorName: string;
  balanceCents: number | null;
  limitCents: number | null;
  currency: string | null;
  balanceReportedOn?: string | null;
  statementClose?: string | null;
  dueDate?: string | null;
};

export type ScenarioPayment = {
  canonicalId: string;
  payment: number | null;
  balanceReportedOn: string | null;
  statementClose: string | null;
  dueDate: string | null;
};

export type UtilizationScenario = {
  snapshotId: string;
  targetBps: number;
  aggregatePaydownCents: number | null;
  perAccountPaydownCents: ScenarioPayment[];
  perAccountTotalCents: number | null;
  scorePrediction: null;
  difference: string | null;
};

function money(value: number | null): value is number {
  return value != null && Number.isSafeInteger(value) && value >= 0;
}

function targetValid(targetBps: number): boolean {
  return Number.isInteger(targetBps) && targetBps >= 0 && targetBps <= 10_000;
}

/** Piso: límite × meta / 10000. El pago no baja de cero ni pasa el saldo. */
export function paydownCents(
  balance: number | null,
  limit: number | null,
  targetBps: number,
): number | null {
  if (!targetValid(targetBps)) return null;
  if (!money(balance) || !money(limit) || limit === 0) return null;
  const target = (BigInt(limit) * BigInt(targetBps)) / 10_000n;
  if (target > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const payment = balance - Number(target);
  if (payment <= 0) return 0;
  return payment > balance ? balance : payment;
}

export function buildUtilizationScenario(input: {
  snapshotId: string;
  targetBps: number;
  aggregateStatus: AggregateStatus;
  accounts: ScenarioAccount[];
}): UtilizationScenario {
  const perAccountPaydownCents = input.accounts.map((account) => ({
    canonicalId: account.canonicalId,
    payment: paydownCents(account.balanceCents, account.limitCents, input.targetBps),
    balanceReportedOn: account.balanceReportedOn ?? null,
    statementClose: account.statementClose ?? null,
    dueDate: account.dueDate ?? null,
  }));
  const paymentsKnown =
    perAccountPaydownCents.length > 0 &&
    perAccountPaydownCents.every((row) => row.payment != null);
  const currencies = input.accounts.map((account) => account.currency);
  const currencyKnown =
    currencies.length > 0 &&
    currencies.every((currency) => currency != null && currency.trim() !== "" && currency === currencies[0]);
  let aggregatePaydownCents: number | null = null;
  if (input.aggregateStatus === "KNOWN" && currencyKnown && paymentsKnown) {
    const balance = input.accounts.reduce((sum, account) => sum + (account.balanceCents ?? 0), 0);
    const limit = input.accounts.reduce((sum, account) => sum + (account.limitCents ?? 0), 0);
    aggregatePaydownCents = paydownCents(balance, limit, input.targetBps);
  }
  const perAccountTotalCents = paymentsKnown
    ? perAccountPaydownCents.reduce((sum, row) => sum + (row.payment ?? 0), 0)
    : null;
  return {
    snapshotId: input.snapshotId,
    targetBps: input.targetBps,
    aggregatePaydownCents,
    perAccountPaydownCents,
    perAccountTotalCents,
    scorePrediction: null,
    difference:
      aggregatePaydownCents != null &&
      perAccountTotalCents != null &&
      aggregatePaydownCents !== perAccountTotalCents
        ? SCENARIO_DIFFERENCE
        : null,
  };
}
