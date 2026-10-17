/**
 * Preparación para Fondeo — señales del reporte + estimado JH de montos (bandas).
 * El estimado no afirma elegibilidad, aprobación, denegación ni oferta de prestamista.
 */

import {
  FUNDING_ESTIMATE_DISCLAIMER,
  computeFundingEstimate,
  formatFundingEstimateMidLabel,
  formatFundingEstimateMoney,
  formatFundingEstimateRange,
  type FundingEstimate,
  type FundingEstimateReady,
} from "@/src/lib/credit/funding-estimate";

export type FundingPrepHub = {
  reportId: string;
  qualified: boolean;
  avgScore: number | null;
  avgUtilization: number | null;
  bureausApproved: number;
  negativeCount: number;
  totalLimit: number | null;
  totalUsed: number | null;
  verdict: string;
};

export type FundingPrepInput = {
  loading: boolean;
  error: string | null;
  hub: FundingPrepHub | null;
};

export type FundingPrepLoading = {
  kind: "loading";
  message: string;
};

export type FundingPrepError = {
  kind: "error";
  message: string;
};

export type FundingPrepReady = {
  kind: "ready";
  title: string;
  tone: "review" | "prepare";
  summary: string;
  verdict: string;
  reportId: string;
  disclaimer: string;
  /** Estimado JH (bandas) o null si datos insuficientes. */
  estimate: FundingEstimate;
  estimateRangeLabel: string | null;
  estimateMidLabel: string | null;
};

export type FundingPrepView =
  | FundingPrepLoading
  | FundingPrepError
  | FundingPrepReady;

export const FUNDING_PREP_LOADING_MESSAGE = "Cargando perfil crediticio…";

export const FUNDING_PREP_DISCLAIMER = FUNDING_ESTIMATE_DISCLAIMER;

export const FUNDING_PREP_TITLE_REVIEW = "Señales heurísticas a revisar";
export const FUNDING_PREP_TITLE_PREPARE = "Heurística: preparar perfil primero";

export function buildFundingPrepPanel(input: FundingPrepInput): FundingPrepView {
  if (input.loading) {
    return { kind: "loading", message: FUNDING_PREP_LOADING_MESSAGE };
  }
  if (input.error) {
    return { kind: "error", message: input.error };
  }
  if (!input.hub) {
    return {
      kind: "error",
      message: "Sin reportes de crédito para este cliente.",
    };
  }

  const hub = input.hub;
  const scoreLabel = hub.avgScore != null ? String(hub.avgScore) : "—";
  const utilLabel =
    hub.avgUtilization != null ? `${hub.avgUtilization}%` : "—";

  const estimate = computeFundingEstimate({
    avgScore: hub.avgScore,
    avgUtilization: hub.avgUtilization,
    bureausApproved: hub.bureausApproved,
    negativeCount: hub.negativeCount,
    totalLimit: hub.totalLimit,
    totalUsed: hub.totalUsed,
    qualified: hub.qualified,
  });

  let estimateRangeLabel: string | null = null;
  let estimateMidLabel: string | null = null;
  if (estimate.kind === "ready") {
    estimateRangeLabel = formatFundingEstimateRange(estimate);
    estimateMidLabel = formatFundingEstimateMidLabel(estimate);
  }

  return {
    kind: "ready",
    title: hub.qualified
      ? FUNDING_PREP_TITLE_REVIEW
      : FUNDING_PREP_TITLE_PREPARE,
    tone: hub.qualified ? "review" : "prepare",
    summary: `${hub.bureausApproved}/3 burós cumplen heurística · score ${scoreLabel} · util ${utilLabel}`,
    verdict: hub.verdict,
    reportId: hub.reportId,
    disclaimer: FUNDING_PREP_DISCLAIMER,
    estimate,
    estimateRangeLabel,
    estimateMidLabel,
  };
}

/** Texto visible del panel (para pruebas). */
export function formatFundingPrepText(view: FundingPrepView): string {
  if (view.kind === "loading" || view.kind === "error") {
    return view.message;
  }
  const montoLines =
    view.estimate.kind === "ready"
      ? [
          `Estimado JH (banda ${view.estimate.bandLabel}): ${view.estimateRangeLabel}`,
          `Punto medio: ${view.estimateMidLabel}`,
        ]
      : [`Estimado JH: ${view.estimate.reason}`];
  return [
    view.title,
    view.summary,
    ...montoLines,
    view.verdict,
    view.disclaimer,
  ].join("\n");
}

export function fundingPrepEstimateReady(
  view: FundingPrepView,
): view is FundingPrepReady & { estimate: FundingEstimateReady } {
  return view.kind === "ready" && view.estimate.kind === "ready";
}

export function formatFundingPrepEstimateDetail(
  estimate: FundingEstimateReady,
): string {
  return [
    `Bajo $${formatFundingEstimateMoney(estimate.low)}`,
    `Medio $${formatFundingEstimateMoney(estimate.mid)}`,
    `Alto $${formatFundingEstimateMoney(estimate.high)}`,
  ].join(" · ");
}
