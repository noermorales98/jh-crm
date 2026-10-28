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

/** Campo comparado entre burós (como el detalle de Fondify, sin contar "N/A"). */
export type DebtField = {
  label: string;
  values: { bureau: CreditBureau; value: string | null }[];
  /** Dos o más burós reportan valores distintos (un dato ausente no cuenta). */
  differs: boolean;
};

/** Cuenta del reporte con los montos extra que guarda el CRM. */
export type ReviewItem = PracticalItem & {
  monthlyPayment?: number | null;
  pastDueAmount?: number | null;
};

export type NegativeDebt = {
  key: string;
  creditorName: string;
  last4: string | null;
  type: CreditNegativeType;
  balance: number | null;
  rows: DebtBureauRow[];
  reasons: SuggestedReason[];
  /** Comparación campo por campo entre burós. */
  fields: DebtField[];
  differences: number;
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

function moneyText(value: number | null | undefined): string | null {
  if (value == null) return null;
  return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/** Tabla campo por campo entre los burós que reportan la deuda. */
function compareFields(members: readonly ReviewItem[]): DebtField[] {
  const spec: [string, (item: ReviewItem) => string | null][] = [
    ["Estado de la cuenta", (i) => clean(i.accountStatus)],
    ["Estado de pago", (i) => clean(i.paymentStatus)],
    ["Abierta / cerrada", (i) => clean(i.openClosedStatus)],
    ["Tipo de cuenta", (i) => clean(i.accountType)],
    ["Fecha de apertura", (i) => dayKey(i.dateOpened)],
    ["Fecha reportada", (i) => dayKey(i.dateReported)],
    ["Límite de crédito", (i) => moneyText(i.creditLimit)],
    ["Saldo reportado", (i) => moneyText(i.balance)],
    ["Monto vencido", (i) => moneyText(i.pastDueAmount)],
    ["Pago mensual", (i) => moneyText(i.monthlyPayment)],
    ["Número de cuenta", (i) => digits(i.accountNumberMasked) || null],
    ["Comentarios", (i) => clean(i.remarks)],
  ];
  return spec
    .map(([label, get]) => {
      const values = members.map((item) => ({ bureau: item.bureau, value: get(item) }));
      const present = values.map((v) => v.value?.toLowerCase()).filter((v): v is string => v != null);
      return { label, values, differs: present.length >= 2 && new Set(present).size > 1 };
    })
    .filter((field) => field.values.some((v) => v.value != null));
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
export function groupNegativeDebts(items: readonly ReviewItem[], asOf: Date): NegativeDebt[] {
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
    const fields = compareFields(g.members.map((m) => m.item as ReviewItem));
    const differing = fields.filter((f) => f.differs);

    // Diferencias entre burós (solo cuando dos burós sí reportan algo distinto).
    if (differing.length > 0) {
      reasons.push({
        code: "INCONSISTENT",
        title: REASON_TITLES.INCONSISTENT,
        detail: `${differing.length} diferencia${differing.length === 1 ? "" : "s"} entre burós: ${differing
          .map((f) => f.label.toLowerCase())
          .join(", ")}.`,
      });
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
      fields,
      differences: differing.length,
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
