/**
 * Lectura del portal para el cliente de la sesión.
 * No publica un borrador, no entrega un documento ajeno y no calcula un monto aprobado.
 */
import { assessAssertion, type AssertionAssessment, type AssertionInput } from "@/src/lib/credit/assertions";
import { PROGRESS_OUTCOME_NOTE } from "@/src/lib/credit/changes";
import { metricText, presentUtilization } from "@/src/lib/credit/metrics-view";

export const PORTAL_VIEW_VERSION = "t23-2026-10-21";
export const SCENARIO_IS_SIMULATION =
  "Escenario de utilización. No es un monto aprobado.";

/** Un PDF analizado sin reporte confirmado no se publica en el portal. */
export function isPortalDocumentPublished(input: {
  hasImportJob: boolean;
  hasConfirmedReport: boolean;
}): boolean {
  if (input.hasImportJob && !input.hasConfirmedReport) return false;
  return true;
}

export type PortalActor = {
  organizationId: string;
  authenticatedClientId: string;
  revokedAt: string | null;
  expiresAt: string | null;
};

export type PortalDocument = {
  clientId: string;
  organizationId: string;
  title: string;
  revoked: boolean;
};

export type PortalViewInput = {
  actor: PortalActor;
  asOf: string;
  clientId: string;
  organizationId: string;
  publication: "DRAFT" | "CONFIRMED";
  basisPoints: number | null;
  scenarioTargetBps: number | null;
  document: PortalDocument | null;
  interview: AssertionInput | null;
};

export type PortalView = {
  version: typeof PORTAL_VIEW_VERSION;
  visible: boolean;
  reason: "SCOPE" | "REVOKED" | "EXPIRED" | "DRAFT" | null;
  formattedUtilization: string | null;
  approvedAmount: null;
  scenarioLabel: string | null;
  scorePrediction: null;
  progressNote: string | null;
  deltaIsSuccess: false;
  documentTitle: string | null;
  interview: AssertionAssessment | null;
};

export function buildPortalView(input: PortalViewInput): PortalView {
  const access = accessBlock(input.actor, input.asOf);
  if (access) return empty(access);
  if (
    input.clientId !== input.actor.authenticatedClientId ||
    input.organizationId !== input.actor.organizationId
  ) {
    return empty("SCOPE");
  }
  if (input.document && !documentOwned(input.actor, input.document)) return empty("SCOPE");

  const draft = input.publication !== "CONFIRMED";
  const utilization = draft
    ? null
    : metricText(presentUtilization({ basisPoints: input.basisPoints, status: "KNOWN" }));
  return {
    version: PORTAL_VIEW_VERSION,
    visible: true,
    reason: draft ? "DRAFT" : null,
    formattedUtilization: utilization === "Sin dato" ? null : utilization,
    approvedAmount: null,
    scenarioLabel: !draft && input.scenarioTargetBps != null ? SCENARIO_IS_SIMULATION : null,
    scorePrediction: null,
    progressNote: PROGRESS_OUTCOME_NOTE,
    deltaIsSuccess: false,
    documentTitle: input.document && !input.document.revoked ? input.document.title : null,
    interview:
      input.interview && interviewOwned(input.actor, input.interview)
        ? assessAssertion(input.interview)
        : null,
  };
}

function accessBlock(actor: PortalActor, asOf: string): "REVOKED" | "EXPIRED" | null {
  if (actor.revokedAt != null && actor.revokedAt.trim() !== "") return "REVOKED";
  if (actor.expiresAt != null && actor.expiresAt.trim() !== "" && asOf > actor.expiresAt) return "EXPIRED";
  return null;
}

function documentOwned(actor: PortalActor, document: PortalDocument): boolean {
  return document.clientId === actor.authenticatedClientId && document.organizationId === actor.organizationId;
}

function interviewOwned(actor: PortalActor, interview: AssertionInput): boolean {
  return interview.clientId === actor.authenticatedClientId && interview.organizationId === actor.organizationId;
}

function empty(reason: "SCOPE" | "REVOKED" | "EXPIRED"): PortalView {
  return {
    version: PORTAL_VIEW_VERSION,
    visible: false,
    reason,
    formattedUtilization: null,
    approvedAmount: null,
    scenarioLabel: null,
    scorePrediction: null,
    progressNote: null,
    deltaIsSuccess: false,
    documentTitle: null,
    interview: null,
  };
}
