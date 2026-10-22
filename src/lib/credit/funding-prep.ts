/**
 * Preparación para fondeo: lecturas del reporte, sin monto estimado.
 */

import { INFORMATIONAL_SCORE_AVERAGE_LABEL } from "@/src/lib/credit/contracts";
import {
  FUNDING_ESTIMATE_DISCLAIMER,
  FUNDING_ESTIMATE_MESSAGE,
  computeFundingEstimate,
  type FundingEstimate,
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
  summary: string;
  verdict: string;
  reportId: string;
  disclaimer: string;
  estimate: FundingEstimate;
};

export type FundingPrepView =
  | FundingPrepLoading
  | FundingPrepError
  | FundingPrepReady;

export const FUNDING_PREP_LOADING_MESSAGE = "Cargando perfil crediticio…";

export const FUNDING_PREP_DISCLAIMER = FUNDING_ESTIMATE_DISCLAIMER;

export const FUNDING_PREP_TITLE = "Requiere programa";

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

  return {
    kind: "ready",
    title: FUNDING_PREP_TITLE,
    summary: `${INFORMATIONAL_SCORE_AVERAGE_LABEL} ${scoreLabel} · utilización revolving ${utilLabel}`,
    verdict: hub.verdict || FUNDING_ESTIMATE_MESSAGE,
    reportId: hub.reportId,
    disclaimer: FUNDING_PREP_DISCLAIMER,
    estimate: computeFundingEstimate(),
  };
}

/** Texto visible del panel (para pruebas). */
export function formatFundingPrepText(view: FundingPrepView): string {
  if (view.kind === "loading" || view.kind === "error") {
    return view.message;
  }
  return [
    view.title,
    view.summary,
    view.estimate.reason,
    view.verdict,
    view.disclaimer,
  ].join("\n");
}
