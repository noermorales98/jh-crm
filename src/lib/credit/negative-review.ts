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

export const NEGATIVE_REVIEW_VERSION = "nr02-2026-10-28";

/**
 * FCRA §605(c): 7 años desde la primera morosidad (+180 días). El reporte no
 * trae esa fecha, así que una apertura de hace más de 7½ años solo sugiere
 * pedirla; no prueba que la cuenta ya deba salir.
 */
const OBSOLETE_MONTHS = 7 * 12 + 6;
/** Diferencia de fecha de reporte que ya indica un buró sin actualizar. */
const STALE_REPORT_MONTHS = 3;

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
  OBSOLETE: "Revisar fecha de salida (7 años)",
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

/** Motivos que señalan un problema concreto (no solo pedir verificación). */
const STRONG_REASONS: ReadonlySet<ReasonCode> = new Set(["INCONSISTENT", "DUPLICATE", "INCOMPLETE"]);

export function hasStrongReason(debt: Pick<NegativeDebt, "reasons">): boolean {
  return debt.reasons.some((reason) => STRONG_REASONS.has(reason.code));
}

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

type FieldRule = "exact" | "stale" | "info";

/**
 * Tabla campo por campo entre los burós que reportan la deuda.
 * - exact: cuenta como diferencia si dos burós dan valores distintos.
 * - stale: fechas de reporte; solo cuenta si se separan más de 3 meses.
 * - info: se muestra pero no cuenta (TransUnion enmascara otro número de
 *   cuenta y cada buró redacta sus comentarios a su manera).
 */
function compareFields(members: readonly ReviewItem[]): DebtField[] {
  const spec: [string, FieldRule, (item: ReviewItem) => string | null][] = [
    ["Estado de la cuenta", "exact", (i) => clean(i.accountStatus)],
    ["Estado de pago", "exact", (i) => clean(i.paymentStatus)],
    ["Abierta / cerrada", "exact", (i) => clean(i.openClosedStatus)],
    ["Tipo de cuenta", "exact", (i) => clean(i.accountType)],
    ["Fecha de apertura", "exact", (i) => dayKey(i.dateOpened)],
    ["Fecha reportada", "stale", (i) => dayKey(i.dateReported)],
    ["Límite de crédito", "exact", (i) => moneyText(i.creditLimit)],
    ["Saldo reportado", "exact", (i) => moneyText(i.balance)],
    ["Monto vencido", "exact", (i) => moneyText(i.pastDueAmount)],
    ["Pago mensual", "exact", (i) => moneyText(i.monthlyPayment)],
    ["Número de cuenta", "info", (i) => digits(i.accountNumberMasked) || null],
    ["Comentarios", "info", (i) => clean(i.remarks)],
  ];
  return spec
    .map(([label, rule, get]) => {
      const values = members.map((item) => ({ bureau: item.bureau, value: get(item) }));
      const present = values.map((v) => v.value?.toLowerCase()).filter((v): v is string => v != null);
      let differs = false;
      if (rule === "exact") differs = present.length >= 2 && new Set(present).size > 1;
      if (rule === "stale" && present.length >= 2) {
        const dates = present.map((v) => new Date(`${v}T00:00:00.000Z`)).sort((a, b) => a.getTime() - b.getTime());
        differs = monthsBetween(dates[0]!, dates[dates.length - 1]!) > STALE_REPORT_MONTHS;
      }
      return { label, values, differs };
    })
    .filter((field) => field.values.some((v) => v.value != null));
}

function monthKey(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 7) : null;
}

const MONTH_FMT = new Intl.DateTimeFormat("es-MX", { month: "short", year: "numeric", timeZone: "UTC" });

const BUREAU_SHORT: Record<CreditBureau, string> = {
  EQUIFAX: "Equifax",
  EXPERIAN: "Experian",
  TRANSUNION: "TransUnion",
};

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

  // 1) Misma deuda, en este orden:
  //    a) mismo acreedor y mismos últimos 4;
  //    b) mismo acreedor, mes de apertura y límite (TransUnion suele enmascarar
  //       otro número para la misma cuenta);
  //    c) si un buró no trae número, mismo acreedor + saldo.
  //    Nunca se juntan dos filas del mismo buró.
  const groups: { name: string; last4: string; balance: number | null; members: typeof negatives }[] = [];
  for (const entry of negatives) {
    const name = normName(entry.item.creditorName);
    const last4 = digits(entry.item.accountNumberMasked);
    const balance = entry.item.balance;
    const opened = monthKey(entry.item.dateOpened);
    const candidates = groups.filter(
      (g) => g.name === name && !g.members.some((m) => m.item.bureau === entry.item.bureau),
    );
    const match =
      candidates.find((g) => last4 !== "" && g.members.some((m) => digits(m.item.accountNumberMasked) === last4)) ??
      candidates.find(
        (g) =>
          opened != null &&
          g.members.some(
            (m) => monthKey(m.item.dateOpened) === opened && (m.item.creditLimit ?? null) === (entry.item.creditLimit ?? null),
          ),
      ) ??
      candidates.find(
        (g) => (last4 === "" || g.last4 === "") && balance != null && balance > 0 && g.balance === balance,
      );
    if (match) {
      match.members.push(entry);
      if (!match.last4 && last4) match.last4 = last4;
      // Se muestra el número que repite la mayoría de los burós.
      const counts = new Map<string, number>();
      for (const m of match.members) {
        const d = digits(m.item.accountNumberMasked);
        if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 1) match.last4 = top[0];
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
      const notes: string[] = [];
      const balances = g.members.filter(({ item }) => item.balance != null);
      const zero = balances.filter(({ item }) => item.balance === 0);
      const owing = balances.filter(({ item }) => (item.balance ?? 0) > 0);
      if (zero.length > 0 && owing.length > 0) {
        notes.push(
          `${owing.map(({ item }) => BUREAU_SHORT[item.bureau]).join(" y ")} reporta saldo ${moneyText(owing[0]!.item.balance)} y ${zero
            .map(({ item }) => BUREAU_SHORT[item.bureau])
            .join(" y ")} lo reporta en 0`,
        );
      }
      const reported = g.members
        .filter(({ item }) => item.dateReported != null)
        .sort((a, b) => a.item.dateReported!.getTime() - b.item.dateReported!.getTime());
      const latest = reported[reported.length - 1]?.item.dateReported;
      if (latest) {
        for (const { item } of reported) {
          if (monthsBetween(item.dateReported!, latest) > STALE_REPORT_MONTHS) {
            notes.push(`${BUREAU_SHORT[item.bureau]} no la actualiza desde ${MONTH_FMT.format(item.dateReported!)}`);
          }
        }
      }
      reasons.push({
        code: "INCONSISTENT",
        title: REASON_TITLES.INCONSISTENT,
        detail: `${differing.length} diferencia${differing.length === 1 ? "" : "s"} entre burós: ${differing
          .map((f) => f.label.toLowerCase())
          .join(", ")}.${notes.length > 0 ? ` ${notes.join("; ")}.` : ""}`,
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
      const cutoff = new Date(Date.UTC(asOf.getUTCFullYear() - 7, asOf.getUTCMonth() - 6, 1));
      reasons.push({
        code: "OBSOLETE",
        title: REASON_TITLES.OBSOLETE,
        detail: `Abierta en ${MONTH_FMT.format(opened)}. Los 7 años se cuentan desde la primera morosidad, no desde la apertura: pide esa fecha al buró; si es anterior a ${MONTH_FMT.format(cutoff)}, debe salir (FCRA §605).`,
      });
    }

    return {
      key: `${g.name}#${g.last4 || g.balance || rows[0]!.itemId}`,
      creditorName: g.members[0]!.item.creditorName,
      last4: g.last4 || null,
      type,
      // El saldo más alto que reporta algún buró (otro puede tenerla en 0).
      balance: rows.reduce<number | null>((max, r) => (r.balance != null && (max == null || r.balance > max) ? r.balance : max), null),
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
    "Please provide the date of first delinquency; if it is older than 7 years, this account must be removed (FCRA 605).",
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
