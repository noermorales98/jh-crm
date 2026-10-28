/**
 * Revisión de cuentas negativas para preparar disputas.
 * - Agrupa por deuda (una tarjeta aunque la reporten 3 burós con números distintos).
 * - Sugiere motivos: diferencias entre burós, duplicados, datos incompletos,
 *   antigüedad (+7 años) y verificación (FCRA §611) como base.
 * - Da el texto de la carta (en inglés, como la plantilla FCRA) por motivo y
 *   por lo que diga el cliente.
 * No crea disputas: eso lo hace la ronda cuando el asesor confirma.
 */

import type { CreditBureau, CreditNegativeType } from "@prisma/client";
import { classifyNegative, type PracticalItem } from "@/src/lib/credit/practical";

export const NEGATIVE_REVIEW_VERSION = "nr01-2026-10-28";

/** FCRA §605: 7 años (+180 días desde la primera morosidad). Sin esa fecha, se usa la apertura como aviso. */
const OBSOLETE_MONTHS = 7 * 12 + 6;

export type ReasonCode = "INCONSISTENT" | "DUPLICATE" | "INCOMPLETE" | "OBSOLETE" | "VERIFY";

export type SuggestedReason = {
  code: ReasonCode;
  title: string;
  detail: string;
};

export type ClientAnswer = "NOT_MINE" | "PAID" | "WRONG_DATA" | "CORRECT" | "UNKNOWN";

export const CLIENT_ANSWER_LABELS: Record<ClientAnswer, string> = {
  NOT_MINE: "No es mía",
  PAID: "Ya la pagué",
  WRONG_DATA: "Datos incorrectos",
  CORRECT: "Es correcta",
  UNKNOWN: "No sé",
};

export const REASON_TITLES: Record<ReasonCode, string> = {
  INCONSISTENT: "Diferencias entre burós",
  DUPLICATE: "Posible duplicado",
  INCOMPLETE: "Datos incompletos o raros",
  OBSOLETE: "Revisar antigüedad (+7 años)",
  VERIFY: "Solicitar verificación",
};

export type DebtBureauRow = {
  itemId: string;
  bureau: CreditBureau;
  status: string | null;
  balance: number | null;
  creditLimit: number | null;
  accountNumberMasked: string | null;
  dateOpened: Date | null;
  dateReported: Date | null;
};

export type NegativeDebt = {
  key: string;
  creditorName: string;
  last4: string | null;
  type: CreditNegativeType;
  balance: number | null;
  rows: DebtBureauRow[];
  reasons: SuggestedReason[];
};

function digits(masked: string | null): string {
  return (masked ?? "").replace(/\D/g, "").slice(-4);
}

function normName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

function dayKey(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function statusOf(item: PracticalItem): string | null {
  const parts = [item.accountStatus, item.paymentStatus].filter(
    (value, index, all): value is string => !!value && all.indexOf(value) === index,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

const TYPE_RANK: Record<CreditNegativeType, number> = {
  BANKRUPTCY: 7,
  FORECLOSURE: 6,
  REPOSSESSION: 5,
  CHARGE_OFF: 4,
  COLLECTION: 3,
  LATE_PAYMENT: 2,
  OTHER: 1,
  HARD_INQUIRY: 0,
};

/** Agrupa las cuentas negativas por deuda y sugiere motivos de disputa. */
export function groupNegativeDebts(items: readonly PracticalItem[], asOf: Date): NegativeDebt[] {
  const negatives = items
    .map((item) => ({ item, type: classifyNegative(item) }))
    .filter((entry): entry is { item: PracticalItem; type: CreditNegativeType } => entry.type != null);

  // 1) Misma deuda: mismo acreedor y mismos últimos 4; si un buró no trae
  //    número, se une por acreedor + saldo.
  const groups: { name: string; last4: string; balance: number | null; members: typeof negatives }[] = [];
  for (const entry of negatives) {
    const name = normName(entry.item.creditorName);
    const last4 = digits(entry.item.accountNumberMasked);
    const balance = entry.item.balance;
    const match = groups.find(
      (g) =>
        g.name === name &&
        ((last4 !== "" && g.last4 !== "" && g.last4 === last4) ||
          ((last4 === "" || g.last4 === "") && balance != null && balance > 0 && g.balance === balance)),
    );
    if (match) {
      match.members.push(entry);
      if (!match.last4 && last4) match.last4 = last4;
      if (match.balance == null) match.balance = balance;
    } else {
      groups.push({ name, last4, balance, members: [entry] });
    }
  }

  const debts: NegativeDebt[] = groups.map((g) => {
    const rows: DebtBureauRow[] = g.members.map(({ item }) => ({
      itemId: item.id,
      bureau: item.bureau,
      status: statusOf(item),
      balance: item.balance,
      creditLimit: item.creditLimit,
      accountNumberMasked: item.accountNumberMasked,
      dateOpened: item.dateOpened,
      dateReported: item.dateReported,
    }));
    const type = g.members
      .map((m) => m.type)
      .sort((a, b) => TYPE_RANK[b] - TYPE_RANK[a])[0]!;
    const reasons: SuggestedReason[] = [];

    // Diferencias entre burós.
    if (rows.length > 1) {
      const diffs: string[] = [];
      const distinct = (values: (string | null)[]) => new Set(values.map((v) => v ?? "sin dato")).size > 1;
      if (distinct(rows.map((r) => (r.balance == null ? null : String(r.balance))))) diffs.push("saldo");
      if (distinct(rows.map((r) => r.status))) diffs.push("estado");
      if (distinct(rows.map((r) => dayKey(r.dateOpened)))) diffs.push("fecha de apertura");
      if (distinct(rows.map((r) => digits(r.accountNumberMasked) || null))) diffs.push("número de cuenta");
      if (diffs.length > 0) {
        reasons.push({
          code: "INCONSISTENT",
          title: REASON_TITLES.INCONSISTENT,
          detail: `Cada buró reporta distinto: ${diffs.join(", ")}.`,
        });
      }
    }

    // Datos incompletos o raros.
    const odd: string[] = [];
    if (rows.some((r) => r.dateOpened == null)) odd.push("sin fecha de apertura");
    if (rows.some((r) => !digits(r.accountNumberMasked))) odd.push("sin número de cuenta");
    if (rows.some((r) => r.balance != null && r.creditLimit != null && r.creditLimit > 0 && r.balance > r.creditLimit)) {
      odd.push("saldo mayor al límite");
    }
    if (g.members.some(({ item }) => /pays as agreed|paid as agreed/i.test(`${item.accountStatus ?? ""} ${item.paymentStatus ?? ""}`))) {
      odd.push("dice 'Pays as Agreed' pero está marcada negativa");
    }
    if (odd.length > 0) {
      reasons.push({ code: "INCOMPLETE", title: REASON_TITLES.INCOMPLETE, detail: `${odd.join("; ")}.` });
    }

    // Antigüedad (aviso: sin fecha de primera morosidad se usa la apertura).
    const opened = rows
      .map((r) => r.dateOpened)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (opened && monthsBetween(opened, asOf) > OBSOLETE_MONTHS) {
      reasons.push({
        code: "OBSOLETE",
        title: REASON_TITLES.OBSOLETE,
        detail: `Abierta hace más de 7 años; confirma la fecha de primera morosidad (FCRA §605).`,
      });
    }

    return {
      key: `${g.name}#${g.last4 || g.balance || rows[0]!.itemId}`,
      creditorName: g.members[0]!.item.creditorName,
      last4: g.last4 || null,
      type,
      balance: g.balance,
      rows,
      reasons,
    };
  });

  // 2) Duplicados: otra deuda negativa con los mismos últimos 4 (acreedor
  //    original y agencia de cobranza) o mismo saldo y una es cobranza.
  for (const debt of debts) {
    const twin = debts.find(
      (other) =>
        other !== debt &&
        normName(other.creditorName) !== normName(debt.creditorName) &&
        ((debt.last4 != null && other.last4 === debt.last4) ||
          (debt.balance != null &&
            debt.balance > 0 &&
            other.balance === debt.balance &&
            (debt.type === "COLLECTION" || other.type === "COLLECTION"))),
    );
    if (twin) {
      debt.reasons.push({
        code: "DUPLICATE",
        title: REASON_TITLES.DUPLICATE,
        detail: `Parece la misma deuda que ${twin.creditorName}${twin.last4 ? ` ****${twin.last4}` : ""}.`,
      });
    }
  }

  for (const debt of debts) {
    if (debt.reasons.length === 0) {
      debt.reasons.push({
        code: "VERIFY",
        title: REASON_TITLES.VERIFY,
        detail: "Pedir al buró que verifique la cuenta y el método usado (FCRA §611).",
      });
    }
  }

  return debts.sort((a, b) => TYPE_RANK[b.type] - TYPE_RANK[a.type] || (b.balance ?? 0) - (a.balance ?? 0));
}

const LETTER_REASON: Record<ReasonCode, string> = {
  INCONSISTENT:
    "The information reported for this account is inconsistent between credit bureaus and therefore cannot be accurate.",
  DUPLICATE:
    "This debt appears to be reported more than once (original creditor and collection agency).",
  INCOMPLETE: "This account is reported with incomplete or inaccurate information.",
  OBSOLETE:
    "This account appears to exceed the reporting period allowed under FCRA section 605.",
  VERIFY:
    "Please verify this account and provide the method used to verify it, as required by FCRA section 611.",
};

const LETTER_ANSWER: Partial<Record<ClientAnswer, string>> = {
  NOT_MINE: "I do not recognize this account.",
  PAID: "This account was paid and must not be reported as unpaid.",
  WRONG_DATA: "The information reported for this account is not correct.",
};

/**
 * reason: frase en inglés (máx. 200) que la plantilla imprime en "Reason:".
 * details: texto completo en inglés + motivos del CRM (en español) para el asesor.
 */
export function disputeTextFor(input: {
  reasons: readonly ReasonCode[];
  answer: ClientAnswer | null;
  clientWords: string | null;
}): { reason: string; details: string } {
  const codes = input.reasons.length > 0 ? input.reasons : (["VERIFY"] as ReasonCode[]);
  const answerLine = input.answer ? LETTER_ANSWER[input.answer] : undefined;
  const reasonLines = codes.map((code) => LETTER_REASON[code]);
  const reason = [answerLine, reasonLines[0]].filter(Boolean).join(" ");
  const details = [
    answerLine,
    ...reasonLines,
    input.clientWords?.trim() ? `Consumer statement: ${input.clientWords.trim()}` : undefined,
    `Motivos (CRM): ${codes.map((code) => REASON_TITLES[code]).join(", ")}.`,
  ]
    .filter((line): line is string => !!line)
    .join(" ");
  return {
    reason: reason.length > 200 ? `${reason.slice(0, 197)}...` : reason,
    details,
  };
}
