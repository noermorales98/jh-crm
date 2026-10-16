/**
 * AU-006 — Bureau API provider contract (fail-closed).
 *
 * Live Experian/Equifax/TransUnion pulls need a paid aggregator + compliance.
 * Until `BUREAU_PROVIDER` names a real adapter, every pull refuses.
 * Day-to-day path remains CR-PDF-001 (PDF import + human confirm).
 */

export const BUREAU_PROVIDER_NONE = "none";
export const BUREAU_NOT_CONFIGURED_CODE = "BUREAU_PROVIDER_NOT_CONFIGURED";

export const BUREAU_NOT_CONFIGURED_MESSAGE =
  "Las APIs automáticas de buró (AU-006) no están configuradas. Usa «Analizar PDF» (CR-PDF-001) o elige un proveedor de pago y define BUREAU_PROVIDER.";

export type BureauProviderId = typeof BUREAU_PROVIDER_NONE | string;

export type BureauPullRequest = {
  organizationId: string;
  clientId: string;
  caseId: string;
  /** Soft trigger only — real providers will need consented PII via secure channel. */
  reason?: string;
};

export type BureauPullResult =
  | { ok: true; provider: string; externalReportId: string }
  | { ok: false; code: string; message: string };

/** Resolve configured provider id (default: none). */
export function resolveBureauProviderId(
  env: NodeJS.ProcessEnv = process.env,
): BureauProviderId {
  const raw = (env.BUREAU_PROVIDER ?? "").trim().toLowerCase();
  return raw || BUREAU_PROVIDER_NONE;
}

export function isBureauProviderConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const id = resolveBureauProviderId(env);
  return id !== BUREAU_PROVIDER_NONE;
}

/**
 * Attempt a bureau pull. Always fail-closed unless a real provider adapter exists.
 * No network calls here — adapters will be wired when a vendor is chosen.
 */
export function attemptBureauPull(
  _req: BureauPullRequest,
  env: NodeJS.ProcessEnv = process.env,
): BureauPullResult {
  const provider = resolveBureauProviderId(env);
  if (provider === BUREAU_PROVIDER_NONE) {
    return {
      ok: false,
      code: BUREAU_NOT_CONFIGURED_CODE,
      message: BUREAU_NOT_CONFIGURED_MESSAGE,
    };
  }
  // Known stub IDs that are not implemented yet.
  return {
    ok: false,
    code: BUREAU_NOT_CONFIGURED_CODE,
    message: `Proveedor de buró «${provider}» aún no tiene adaptador. Mantén CR-PDF-001 o implementa el conector.`,
  };
}
