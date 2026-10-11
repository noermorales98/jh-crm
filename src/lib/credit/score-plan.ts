/**
 * Estimación de pago por cuenta para Score Plan.
 * Solo calcula un monto cuando límite y saldo son conocidos.
 * No consulta red ni base de datos.
 */

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
    const currentPct = (balance / limit) * 100;
    const targetBalance = limit * (targetPct / 100);
    const amount = Math.max(0, Math.round(balance - targetBalance));
    return {
      kind: "ready",
      name,
      pct: Math.round(currentPct),
      amount,
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
