/**
 * Lectura práctica del reporte (estilo Fondify) para el Análisis de Crédito.
 *
 * La lectura certificada (revolving.ts / ownership.ts) exige tipo de cuenta,
 * titular explícito, identidad confirmada y moneda; con PDFs importados casi
 * nunca se cumple. Esta lectura usa reglas de la industria para estimar:
 * - Tarjeta: el tipo lo dice, o tiene límite y no es préstamo ni cobranza.
 * - Titular: sin dato = titular principal (solo "authorized user" es AU).
 * - Abierta: todo lo que no esté marcado como cerrado, cobranza o charge-off.
 * - Una tarjeta repetida en varios burós cuenta una vez (nombre + últimos 4 + límite).
 * - Edad promedio: incluye cuentas cerradas que siguen en el reporte (como FICO),
 *   excluye cobranzas de terceros.
 * - Negativos: reglas fijas sobre el texto de estado; un atraso cuyo último
 *   reporte tiene más de 3 años no bloquea fondeo.
 */

import type { CreditBureau, CreditNegativeType } from "@prisma/client";

export const PRACTICAL_READING_VERSION = "p01-2026-10-27";

/** Un atraso reportado hace más de esto no bloquea fondeo (regla de la agencia). */
export const OLD_LATE_MONTHS = 36;
/** Ventana de consultas duras para el criterio de fondeo. */
export const INQUIRY_WINDOW_MONTHS = 6;

export type PracticalItem = {
  id: string;
  creditorName: string;
  accountNumberMasked: string | null;
  accountType: string | null;
  bureau: CreditBureau;
  balance: number | null;
  creditLimit: number | null;
  dateOpened: Date | null;
  dateReported: Date | null;
  accountStatus: string | null;
  paymentStatus: string | null;
  openClosedStatus: string | null;
  remarks: string | null;
  ownershipType: string | null;
  isNegative: boolean;
  negativeType: CreditNegativeType | null;
};

export type PracticalCard = {
  key: string;
  creditorName: string;
  bureaus: CreditBureau[];
  limit: number;
  balance: number;
  utilizationBps: number;
  authorizedUser: boolean;
};

export type PracticalNegative = {
  item: PracticalItem;
  type: CreditNegativeType;
  /** Atraso viejo (más de 3 años desde el último reporte): no bloquea. */
  old: boolean;
};

function text(item: PracticalItem): string {
  return [item.accountType, item.accountStatus, item.paymentStatus, item.openClosedStatus, item.remarks]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function last4(masked: string | null): string {
  const digits = (masked ?? "").replace(/\D/g, "");
  return digits.slice(-4);
}

function normName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}

const CLOSED_RE = /\b(closed|cerrad[ao]|paid off|transferred|refinanced)\b/;
const COLLECTION_RE = /\b(collection|cobranza|en cobro)\b/;
const CHARGE_OFF_RE = /charge[- ]?off|charged off|castigad/;
const LOAN_RE = /\b(installment|auto|mortgage|student|loan|pr[eé]stamo|hipoteca|lease)\b/;
const REVOLVING_RE = /\b(revolving|credit card|tarjeta|line of credit|charge card)\b/;
const AU_RE = /authorized\s+user|usuario\s+autorizado|\bau\b/;
const LATE_RE = /(\d{2,3})\s*days?\s*(past due|late)|\blate\b|past due|delinquen|atras/;
const CLEAN_RE = /pays as agreed|paid as agreed|\bcurrent\b|never late|al d[ií]a/;

/**
 * Tipo de negativo según el texto del reporte. null = no es negativo.
 * Corrige la clasificación de la IA cuando el texto la contradice.
 */
export function classifyNegative(item: PracticalItem): CreditNegativeType | null {
  const t = text(item);
  if (/bankrupt|bancarrota/.test(t)) return "BANKRUPTCY";
  if (/repossess|reposes/.test(t)) return "REPOSSESSION";
  if (/foreclos|ejecuci[oó]n hipotecaria/.test(t)) return "FORECLOSURE";
  if (CHARGE_OFF_RE.test(t)) return "CHARGE_OFF";
  if (COLLECTION_RE.test(t)) return "COLLECTION";
  if (LATE_RE.test(t)) return "LATE_PAYMENT";
  if (item.negativeType === "HARD_INQUIRY") return null;
  if (!item.isNegative) return null;
  // La IA lo marcó negativo pero el estado dice "al día": solo se mantiene un
  // atraso histórico (las marcas viven en la cuadrícula de pagos).
  if (CLEAN_RE.test(t)) return item.negativeType === "LATE_PAYMENT" ? "LATE_PAYMENT" : null;
  return item.negativeType ?? "OTHER";
}

export function practicalNegatives(items: readonly PracticalItem[], asOf: Date): PracticalNegative[] {
  const out: PracticalNegative[] = [];
  for (const item of items) {
    const type = classifyNegative(item);
    if (!type) continue;
    const reported = item.dateReported ?? item.dateOpened;
    const old =
      type === "LATE_PAYMENT" && reported != null && monthsBetween(reported, asOf) > OLD_LATE_MONTHS;
    out.push({ item, type, old });
  }
  return out;
}

function isCardCandidate(item: PracticalItem): boolean {
  const t = text(item);
  if (COLLECTION_RE.test(t) || CHARGE_OFF_RE.test(t)) return false;
  if (REVOLVING_RE.test((item.accountType ?? "").toLowerCase())) return true;
  if (LOAN_RE.test((item.accountType ?? "").toLowerCase())) return false;
  return item.creditLimit != null && item.creditLimit > 0;
}

function isOpen(item: PracticalItem): boolean {
  const status = [item.openClosedStatus, item.accountStatus].filter(Boolean).join(" ").toLowerCase();
  return !CLOSED_RE.test(status);
}

function cardKey(item: PracticalItem): string {
  const digits = last4(item.accountNumberMasked);
  return `${normName(item.creditorName)}#${digits || "x"}#${item.creditLimit ?? "x"}`;
}

/** Tarjetas abiertas con límite (deduplicadas entre burós). */
export function practicalCards(items: readonly PracticalItem[]): PracticalCard[] {
  const byKey = new Map<string, PracticalCard>();
  for (const item of items) {
    if (!isCardCandidate(item) || !isOpen(item)) continue;
    if (item.creditLimit == null || item.creditLimit <= 0) continue;
    const key = cardKey(item);
    const balance = Math.max(item.balance ?? 0, 0);
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.bureaus.includes(item.bureau)) existing.bureaus.push(item.bureau);
      continue;
    }
    byKey.set(key, {
      key,
      creditorName: item.creditorName,
      bureaus: [item.bureau],
      limit: item.creditLimit,
      balance,
      utilizationBps: Math.round((balance / item.creditLimit) * 10000),
      authorizedUser: AU_RE.test((item.ownershipType ?? "").toLowerCase()),
    });
  }
  return [...byKey.values()].sort((a, b) => b.limit - a.limit);
}

/** Utilización (bps) = saldo total / límite total. Nunca promedio de porcentajes. */
export function totalUtilizationBps(cards: readonly PracticalCard[]): number | null {
  const limit = cards.reduce((sum, card) => sum + card.limit, 0);
  if (limit <= 0) return null;
  const balance = cards.reduce((sum, card) => sum + card.balance, 0);
  return Math.round((balance / limit) * 10000);
}

/** Edad promedio en meses (abiertas y cerradas; sin cobranzas de terceros). */
export function averageAgeMonths(items: readonly PracticalItem[], asOf: Date): number | null {
  const ages = items
    .filter((item) => item.dateOpened != null && !COLLECTION_RE.test(text(item)))
    .map((item) => monthsBetween(item.dateOpened!, asOf))
    .filter((months) => months >= 0);
  if (ages.length === 0) return null;
  return ages.reduce((sum, m) => sum + m, 0) / ages.length;
}

/** Consultas dentro de la ventana (fecha del reporte hacia atrás). */
export function inquiriesInWindow(
  inquiries: readonly { inquiryDate: Date | null }[],
  asOf: Date,
): { counted: number; undated: number } {
  let counted = 0;
  let undated = 0;
  for (const inquiry of inquiries) {
    if (!inquiry.inquiryDate) {
      undated += 1;
      continue;
    }
    const months = monthsBetween(inquiry.inquiryDate, asOf);
    if (months >= 0 && months < INQUIRY_WINDOW_MONTHS) counted += 1;
  }
  return { counted, undated };
}
