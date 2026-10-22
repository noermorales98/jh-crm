/**
 * Compuerta de activación por organización.
 * Nace apagada. No escribe configuración ni enciende un cobro.
 */

export const ACTIVATION_VERSION = "t28-2026-10-22";

export type ActivationInput = {
  migrationApplied: boolean;
  corpusPassed: boolean;
  journeyPassed: boolean;
  isolationPassed: boolean;
  telemetryReady: boolean;
  policyReviewed: boolean;
  programReviewed: boolean;
};

export type ActivationDecision = {
  version: typeof ACTIVATION_VERSION;
  ready: boolean;
  reasons: string[];
};

export function activationGate(input: ActivationInput): ActivationDecision {
  const reasons: string[] = [];
  if (!input.migrationApplied) reasons.push("MIGRATION");
  if (!input.corpusPassed) reasons.push("CORPUS");
  if (!input.journeyPassed) reasons.push("JOURNEY");
  if (!input.isolationPassed) reasons.push("ISOLATION");
  if (!input.telemetryReady) reasons.push("TELEMETRY");
  if (!input.policyReviewed) reasons.push("POLICY");
  if (!input.programReviewed) reasons.push("PROGRAM");
  return {
    version: ACTIVATION_VERSION,
    ready: reasons.length === 0,
    reasons,
  };
}
