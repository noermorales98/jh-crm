/**
 * Estimado JH de preparación para fondeo (bandas low/mid/high).
 *
 * Usa score, utilización, negativos, burós que cumplen heurística del plan
 * y, si hay dato, capacidad revolving (límite − saldo).
 *
 * NO es oferta de prestamista, elegibilidad ni aprobación.
 * NO copia fórmulas propietarias de terceros.
 */

export type FundingEstimateInput = {
  avgScore: number | null;
  avgUtilization: number | null;
  bureausApproved: number;
  negativeCount: number;
  totalLimit: number | null;
  totalUsed: number | null;
  qualified: boolean;
};

export type FundingEstimateReady = {
  kind: "ready";
  low: number;
  mid: number;
  high: number;
  bandLabel: "bajo" | "medio" | "alto";
  basis: "score_signals" | "revolving_capacity" | "mixed";
  assumptions: string[];
};

export type FundingEstimateInsufficient = {
  kind: "insufficient";
  reason: string;
};

export type FundingEstimate = FundingEstimateReady | FundingEstimateInsufficient;

export const FUNDING_ESTIMATE_DISCLAIMER =
  "Estimado interno JH (bandas). No es oferta, preaprobación ni elegibilidad de un prestamista.";

/** Redondeo a centenas de USD para lectura de panel. */
export function roundFundingEstimate(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount / 100) * 100;
}

export function formatFundingEstimateMoney(amount: number): string {
  return roundFundingEstimate(amount).toLocaleString("en-US");
}

/** Mid base por tramo de score (heurística JH, alineada a umbral plan ~720). */
export function scoreTierBaseMid(score: number): number {
  if (score < 580) return 1_500;
  if (score < 620) return 3_500;
  if (score < 660) return 7_000;
  if (score < 700) return 12_000;
  if (score < 720) return 18_000;
  if (score < 740) return 24_000;
  return 32_000;
}

function utilFactor(util: number | null): { factor: number; note: string } {
  if (util == null) {
    return { factor: 0.75, note: "utilización sin dato → factor 0.75" };
  }
  if (util > 30) {
    return { factor: 0.4, note: `utilización ${util}% > 30 → factor 0.4` };
  }
  if (util > 15) {
    return { factor: 0.65, note: `utilización ${util}% > 15 → factor 0.65` };
  }
  if (util > 10) {
    return { factor: 0.85, note: `utilización ${util}% > 10 → factor 0.85` };
  }
  return { factor: 1, note: `utilización ${util}% ≤ 10 → factor 1.0` };
}

function negFactor(count: number): { factor: number; note: string } {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return { factor: 1, note: "0 negativos → factor 1.0" };
  if (n <= 2) return { factor: 0.55, note: `${n} negativos → factor 0.55` };
  if (n <= 5) return { factor: 0.35, note: `${n} negativos → factor 0.35` };
  return { factor: 0.2, note: `${n} negativos → factor 0.2` };
}

function bureauFactor(approved: number): { factor: number; note: string } {
  const a = Math.min(3, Math.max(0, Math.floor(approved)));
  const map = [0.45, 0.7, 0.88, 1] as const;
  return {
    factor: map[a]!,
    note: `${a}/3 burós cumplen heurística → factor ${map[a]}`,
  };
}

function bandLabelForMid(mid: number): FundingEstimateReady["bandLabel"] {
  if (mid < 8_000) return "bajo";
  if (mid < 20_000) return "medio";
  return "alto";
}

/**
 * Calcula bandas low/mid/high a partir de señales del reporte / plan.
 */
export function computeFundingEstimate(
  input: FundingEstimateInput,
): FundingEstimate {
  const assumptions: string[] = [];
  const hasScore =
    input.avgScore != null && Number.isFinite(input.avgScore);
  const limit =
    input.totalLimit != null && Number.isFinite(input.totalLimit)
      ? Math.max(0, input.totalLimit)
      : null;
  const used =
    input.totalUsed != null && Number.isFinite(input.totalUsed)
      ? Math.max(0, input.totalUsed)
      : null;
  const available =
    limit != null && used != null ? Math.max(0, limit - used) : null;

  if (!hasScore && (available == null || available <= 0)) {
    return {
      kind: "insufficient",
      reason:
        "Sin score ni capacidad revolving en el reporte para estimar un monto.",
    };
  }

  let midRaw = 0;
  let basis: FundingEstimateReady["basis"] = "score_signals";

  if (hasScore) {
    const base = scoreTierBaseMid(input.avgScore!);
    assumptions.push(`tramo score ${input.avgScore} → base mid $${base}`);
    const u = utilFactor(input.avgUtilization);
    const n = negFactor(input.negativeCount);
    const b = bureauFactor(input.bureausApproved);
    const prep = input.qualified
      ? { factor: 1, note: "heurística cualificada → factor 1.0" }
      : { factor: 0.5, note: "heurística no cualificada → factor 0.5" };
    assumptions.push(u.note, n.note, b.note, prep.note);
    midRaw = base * u.factor * n.factor * b.factor * prep.factor;
  }

  if (available != null && available > 0) {
    const fromRevolving = available * 0.45;
    assumptions.push(
      `capacidad revolving (límite−saldo) $${Math.round(available)} → ancla 45% = $${Math.round(fromRevolving)}`,
    );
    if (hasScore) {
      midRaw = (midRaw + fromRevolving) / 2;
      basis = "mixed";
      assumptions.push("mid = promedio (señales score × capacidad revolving)");
    } else {
      midRaw = fromRevolving;
      basis = "revolving_capacity";
      const u = utilFactor(input.avgUtilization);
      const n = negFactor(input.negativeCount);
      const b = bureauFactor(input.bureausApproved);
      const prep = input.qualified
        ? { factor: 1, note: "heurística cualificada → factor 1.0" }
        : { factor: 0.5, note: "heurística no cualificada → factor 0.5" };
      assumptions.push(u.note, n.note, b.note, prep.note);
      midRaw = midRaw * u.factor * n.factor * b.factor * prep.factor;
    }
  }

  let mid = roundFundingEstimate(midRaw);
  let low = roundFundingEstimate(midRaw * 0.6);
  let high = roundFundingEstimate(midRaw * 1.4);

  if (available != null && available > 0) {
    const cap = roundFundingEstimate(available);
    if (high > cap) {
      high = cap;
      assumptions.push(`high limitado a capacidad revolving $${cap}`);
    }
    if (mid > high) mid = high;
    if (low > mid) low = mid;
  }

  if (mid <= 0 && high <= 0) {
    return {
      kind: "insufficient",
      reason: "Las señales del reporte producen un estimado de $0.",
    };
  }

  // Garantiza orden low ≤ mid ≤ high
  low = Math.min(low, mid);
  high = Math.max(high, mid);

  return {
    kind: "ready",
    low,
    mid,
    high,
    bandLabel: bandLabelForMid(mid),
    basis,
    assumptions,
  };
}

export function formatFundingEstimateRange(
  estimate: FundingEstimateReady,
): string {
  return `$${formatFundingEstimateMoney(estimate.low)} – $${formatFundingEstimateMoney(estimate.high)}`;
}

export function formatFundingEstimateMidLabel(
  estimate: FundingEstimateReady,
): string {
  return `~$${formatFundingEstimateMoney(estimate.mid)}`;
}
