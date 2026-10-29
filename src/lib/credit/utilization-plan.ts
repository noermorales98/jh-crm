/**
 * Score Plan: bajar la utilización de las tarjetas abiertas, aparte de la
 * reparación de negativas.
 * - Usa las tarjetas de la lectura práctica (abiertas, con límite, sin
 *   duplicar la misma cuenta entre burós).
 * - Utilización = saldo total / límite total (nunca promedio de porcentajes).
 * - Muestra bandas (Ideal, Aceptable, Alta…), no puntos: ningún modelo
 *   público permite prometer puntos (CROA).
 * No envía pagos ni modifica el reporte.
 */

import type { CreditBureau } from "@prisma/client";
import type { PracticalCard } from "@/src/lib/credit/practical";

export const UTILIZATION_PLAN_VERSION = "up01-2026-10-28";

/** Meta por defecto: por debajo de 10% (se usa 9% para quedar dentro). */
export const DEFAULT_TARGET_PCT = 9;

export type UtilBand = "NONE" | "IDEAL" | "OK" | "HIGH" | "VERY_HIGH";

export const BAND_LABEL: Record<UtilBand, string> = {
  NONE: "Sin uso",
  IDEAL: "Ideal",
  OK: "Aceptable",
  HIGH: "Alta",
  VERY_HIGH: "Muy alta",
};

export const BAND_HINT: Record<UtilBand, string> = {
  NONE: "0% en todas puede verse como crédito sin uso; deja un poco en una tarjeta.",
  IDEAL: "Menos de 10%: el rango que mejor ven los modelos de puntaje.",
  OK: "Entre 10% y 29%: aceptable, pero aún resta.",
  HIGH: "Entre 30% y 49%: pesa en contra del puntaje.",
  VERY_HIGH: "50% o más: es de lo que más baja el puntaje.",
};

export function bandFor(bps: number | null): UtilBand | null {
  if (bps == null) return null;
  if (bps <= 0) return "NONE";
  if (bps < 1000) return "IDEAL";
  if (bps < 3000) return "OK";
  if (bps < 5000) return "HIGH";
  return "VERY_HIGH";
}

export type PlanCard = {
  key: string;
  creditorName: string;
  bureaus: CreditBureau[];
  limit: number;
  balance: number;
  utilizationBps: number;
};

export function planCardsFrom(cards: readonly PracticalCard[]): PlanCard[] {
  return cards.map((card) => ({
    key: card.key,
    creditorName: card.creditorName,
    bureaus: [...card.bureaus],
    limit: card.limit,
    balance: card.balance,
    utilizationBps: card.utilizationBps,
  }));
}

function bps(balance: number, limit: number): number | null {
  return limit > 0 ? Math.round((balance / limit) * 10000) : null;
}

export function totals(cards: readonly PlanCard[]) {
  const limit = cards.reduce((sum, c) => sum + c.limit, 0);
  const balance = cards.reduce((sum, c) => sum + c.balance, 0);
  return { limit, balance, utilizationBps: bps(balance, limit) };
}

export type PayRow = {
  key: string;
  creditorName: string;
  limit: number;
  balance: number;
  nowBps: number;
  payment: number;
  afterBps: number;
};

export type PayPlan = {
  targetPct: number;
  rows: PayRow[];
  totalPayment: number;
  afterBps: number | null;
  /** Tarjetas que ya están por debajo de 10%. */
  alreadyIdeal: PayRow[];
};

/**
 * Lleva cada tarjeta a la meta (en orden: la de mayor % primero). Bajar cada
 * una a la meta también deja el total en la meta o menos, y cuida el % por
 * tarjeta, que los modelos también miran.
 */
export function payToTarget(cards: readonly PlanCard[], targetPct: number): PayPlan {
  const target = Math.min(Math.max(targetPct, 0), 100) / 100;
  const rows = [...cards]
    .sort((a, b) => b.utilizationBps - a.utilizationBps || b.balance - a.balance)
    .map((card) => {
      const payment = Math.max(0, Math.ceil(card.balance - card.limit * target));
      const after = Math.max(card.balance - payment, 0);
      return {
        key: card.key,
        creditorName: card.creditorName,
        limit: card.limit,
        balance: card.balance,
        nowBps: card.utilizationBps,
        payment,
        afterBps: bps(after, card.limit) ?? 0,
      };
    });
  const limit = rows.reduce((sum, r) => sum + r.limit, 0);
  const after = rows.reduce((sum, r) => sum + r.balance - r.payment, 0);
  return {
    targetPct,
    rows: rows.filter((r) => r.payment > 0),
    totalPayment: rows.reduce((sum, r) => sum + r.payment, 0),
    afterBps: bps(after, limit),
    alreadyIdeal: rows.filter((r) => r.nowBps < 1000),
  };
}

/** Utilización si se cierra una tarjeta: su saldo sigue contando, su límite no. */
export function closeCardImpact(cards: readonly PlanCard[], key: string) {
  const card = cards.find((c) => c.key === key);
  if (!card) return null;
  const before = totals(cards);
  const rest = cards.filter((c) => c.key !== key);
  const limitAfter = rest.reduce((sum, c) => sum + c.limit, 0);
  const afterBps = bps(before.balance, limitAfter);
  return {
    card,
    beforeBps: before.utilizationBps,
    afterBps,
    lostLimit: card.limit,
    beforeBand: bandFor(before.utilizationBps),
    afterBand: bandFor(afterBps),
  };
}

function pct(bpsValue: number | null): string {
  return bpsValue == null ? "sin dato" : `${Math.round(bpsValue / 100)}%`;
}

function usd(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** Texto para compartir con el cliente (WhatsApp, correo). */
export function scorePlanCopy(input: {
  clientName: string;
  cards: readonly PlanCard[];
  plan: PayPlan;
}): string {
  const now = totals(input.cards);
  const band = bandFor(now.utilizationBps);
  const lines = [
    `Plan para bajar el uso de tus tarjetas: ${input.clientName}`,
    `Hoy usas ${usd(now.balance)} de ${usd(now.limit)}: ${pct(now.utilizationBps)}${band ? ` (${BAND_LABEL[band]})` : ""}.`,
    `Meta: menos de ${input.plan.targetPct + 1}% en total y en cada tarjeta.`,
    "",
  ];
  if (input.plan.rows.length === 0) {
    lines.push("Tus tarjetas ya están en la meta. Mantén los saldos así.");
  } else {
    lines.push("Paga en este orden, antes de la fecha de corte de cada tarjeta:");
    input.plan.rows.forEach((row, index) => {
      lines.push(`${index + 1}. ${row.creditorName}: paga ${usd(row.payment)} (de ${pct(row.nowBps)} a ${pct(row.afterBps)}).`);
    });
    lines.push(`Total: ${usd(input.plan.totalPayment)}. Quedarías en ${pct(input.plan.afterBps)}.`);
  }
  lines.push(
    "",
    "Consejos:",
    "- Paga antes de la fecha de corte del estado de cuenta: ese es el saldo que se reporta.",
    "- Deja un saldo pequeño (1% a 9%) en una tarjeta; no todas en $0.",
    "- No cierres tarjetas viejas: pierdes límite y antigüedad.",
    "- El cambio se ve cuando el banco reporta, normalmente en 30 a 45 días.",
    "",
    "Es una estimación con los datos de tu reporte, no una garantía de puntaje.",
  );
  return lines.join("\n");
}
