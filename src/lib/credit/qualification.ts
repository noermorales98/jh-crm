/**
 * Calificación crediticia de solo lectura (PR-AN-QUAL).
 *
 * Distinta del pipeline comercial (ClientStatus → FondifyBucket).
 * No persiste. No usa umbrales de score/utilización ni tarifas de Fondify
 * como reglas fijas: solo presencia de reporte/snapshots y negativos abiertos.
 *
 * Resultados:
 * - sin_datos: sin reporte o sin snapshots → no hay calificación.
 * - revision: hay datos y negativos abiertos → en revisión (nunca “listo”).
 * - heuristica: hay datos sin negativos abiertos → lectura heurística
 *   (nunca “aprobado” / “listo para fondeo”).
 */

export type CreditQualificationKind = "sin_datos" | "revision" | "heuristica";

export type CreditQualificationInput = {
  hasReport: boolean;
  snapshotCount: number;
  openNegativeCount: number;
};

export type CreditQualificationResult = {
  kind: CreditQualificationKind;
  label: string;
  hint: string;
};

export function qualifyCreditProfile(
  input: CreditQualificationInput,
): CreditQualificationResult {
  const hasReport = Boolean(input.hasReport);
  const snapshots = Math.max(0, input.snapshotCount);
  const negatives = Math.max(0, input.openNegativeCount);

  if (!hasReport || snapshots === 0) {
    return {
      kind: "sin_datos",
      label: "Sin calificación crediticia",
      hint: "Sin reporte o sin scores de buró; no hay calificación de crédito.",
    };
  }

  if (negatives > 0) {
    return {
      kind: "revision",
      label: "En revisión crediticia",
      hint: "Hay ítems negativos abiertos; la lectura no implica elegibilidad.",
    };
  }

  return {
    kind: "heuristica",
    label: "Lectura heurística",
    hint: "Estimado interno a partir del reporte; no es aprobación ni oferta.",
  };
}
