/**
 * El monto de fondeo no se calcula.
 * Hace falta un programa documentado y datos verificados.
 * No hay bandas, multiplicadores ni score de preparación.
 */

export const FUNDING_ESTIMATE_REASON =
  "PROGRAM_AND_VERIFIED_INPUTS_REQUIRED" as const;

export const FUNDING_ESTIMATE_MESSAGE =
  "El monto de fondeo y el cambio de puntos requieren un programa documentado y datos verificados. Los scores y la utilización mostrados son lecturas del reporte.";

export type FundingEstimate = {
  status: "UNAVAILABLE";
  amount: null;
  reason: typeof FUNDING_ESTIMATE_REASON;
};

export const FUNDING_ESTIMATE_DISCLAIMER = FUNDING_ESTIMATE_MESSAGE;

export function computeFundingEstimate(): FundingEstimate {
  return {
    status: "UNAVAILABLE",
    amount: null,
    reason: FUNDING_ESTIMATE_REASON,
  };
}
