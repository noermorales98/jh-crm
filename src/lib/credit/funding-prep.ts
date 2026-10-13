/**
 * Preparación para Fondeo — lectura heurística del reporte.
 * No calcula montos. No afirma elegibilidad, aprobación, denegación ni oferta.
 */

export type FundingPrepHub = {
  reportId: string;
  qualified: boolean;
  avgScore: number | null;
  avgUtilization: number | null;
  bureausApproved: number;
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
};

export type FundingPrepView =
  | FundingPrepLoading
  | FundingPrepError
  | FundingPrepReady;

export const FUNDING_PREP_LOADING_MESSAGE = "Cargando perfil crediticio…";

export const FUNDING_PREP_DISCLAIMER =
  "Lectura heurística del reporte. No es elegibilidad, aprobación, denegación ni oferta de fondeo.";

export const FUNDING_PREP_TITLE_REVIEW = "Señales heurísticas a revisar";
export const FUNDING_PREP_TITLE_PREPARE = "Heurística: preparar perfil primero";

const DOLLAR_AMOUNT_RE = /\$\s*[\d.,]+/;

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
    title: hub.qualified
      ? FUNDING_PREP_TITLE_REVIEW
      : FUNDING_PREP_TITLE_PREPARE,
    tone: hub.qualified ? "review" : "prepare",
    summary: `${hub.bureausApproved}/3 burós cumplen heurística · score ${scoreLabel} · util ${utilLabel}`,
    verdict: hub.verdict,
    reportId: hub.reportId,
    disclaimer: FUNDING_PREP_DISCLAIMER,
  };
}

/** Texto visible del panel (para pruebas). Sin montos de fondeo. */
export function formatFundingPrepText(view: FundingPrepView): string {
  if (view.kind === "loading" || view.kind === "error") {
    return view.message;
  }
  return [view.title, view.summary, view.verdict, view.disclaimer].join("\n");
}

export function fundingPrepHasDollarAmount(view: FundingPrepView): boolean {
  return DOLLAR_AMOUNT_RE.test(formatFundingPrepText(view));
}

export function fundingPrepExposesAmountFields(view: FundingPrepView): boolean {
  const keys = Object.keys(view);
  return keys.some((k) => /^(amount|estimate|raw|monto)$/i.test(k));
}
