/**
 * JH-010 / TEST-010 — proveniencia de campos de crédito (sin migración).
 *
 * Reglas:
 * - N/A ≠ 0: ausencia → null; cero reportado → 0.
 * - Cada valor tipado puede llevar buró / página / fuente.
 * - Contradicciones entre burós → revisión humana; no disputa automática.
 */

export type CreditFieldSource = "PDF_EXTRACT" | "MANUAL" | "IMPORT" | "UNKNOWN";

export type FieldProvenance = {
  bureau?: "EQUIFAX" | "EXPERIAN" | "TRANSUNION" | "OTHER" | null;
  page?: number | null;
  source: CreditFieldSource;
};

export type ProvenancedValue<T> = {
  value: T | null;
  /** true si el documento marcó explícitamente N/A / blank (no cero). */
  isNotApplicable: boolean;
  provenance: FieldProvenance;
};

/** Interpreta raw de extracción: "", "N/A", "NA", "—" → null+N/A; "0" → 0. */
export function parseNumericField(
  raw: unknown,
  provenance: FieldProvenance,
): ProvenancedValue<number> {
  if (raw === null || raw === undefined) {
    return { value: null, isNotApplicable: false, provenance };
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { value: raw, isNotApplicable: false, provenance };
  }
  const s = String(raw).trim();
  if (!s) {
    return { value: null, isNotApplicable: false, provenance };
  }
  if (/^(n\/?a|na|null|none|—|--|-)$/i.test(s)) {
    return { value: null, isNotApplicable: true, provenance };
  }
  const n = Number(s.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) {
    return { value: null, isNotApplicable: false, provenance };
  }
  return { value: n, isNotApplicable: false, provenance };
}

export type BureauBalance = {
  bureau: "EQUIFAX" | "EXPERIAN" | "TRANSUNION";
  balance: ProvenancedValue<number>;
};

/**
 * Detecta contradicción de saldos entre burós (ambos presentes y distintos).
 * No dispara disputa: solo flag de revisión humana.
 */
export function findBalanceContradictions(
  rows: BureauBalance[],
): Array<{ bureaus: string[]; values: number[] }> {
  const present = rows
    .map((r) => ({
      bureau: r.bureau,
      value: r.balance.isNotApplicable ? null : r.balance.value,
    }))
    .filter((r) => r.value !== null) as Array<{
    bureau: string;
    value: number;
  }>;
  if (present.length < 2) return [];
  const values = [...new Set(present.map((p) => p.value))];
  if (values.length <= 1) return [];
  return [
    {
      bureaus: present.map((p) => p.bureau),
      values: present.map((p) => p.value),
    },
  ];
}

/** Nunca auto-crear disputa por contradicción. */
export function shouldAutoDisputeOnContradiction(): false {
  return false;
}
