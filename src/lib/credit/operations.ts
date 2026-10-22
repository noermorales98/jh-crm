/**
 * Decisión operativa de envío o cobro.
 * Una autorización vacía no es consentimiento y una política ajena no bloquea otro servicio.
 */

export const OPERATION_POLICY_VERSION = "t25-2026-10-21";
export const OPERATION_SOURCE_NOTE =
  "D4 es una fuente de revisión. No es una política de plazos.";
export const OPERATION_REVIEW_LABEL = "Revisión";

export type OperationAction = "SEND_DISPUTE" | "CHARGE_SERVICE";
export type OperationStatus = "ALLOWED" | "BLOCKED" | "REVIEW";

export type OperationPolicy = {
  id: string;
  version: number;
  reviewed: boolean;
  serviceType: string;
  effectiveFrom: string;
  effectiveUntil: string;
  chargeAllowed: boolean;
};

export type OperationContract = {
  version: string;
  signed: boolean;
} | null;

export type OperationAuthorization = {
  revokedAt: string | null;
} | null;

export type OperationDecision = {
  version: typeof OPERATION_POLICY_VERSION;
  action: OperationAction;
  status: OperationStatus;
  serviceType: string;
  policyId: string | null;
  policyVersion: number | null;
  reasons: string[];
  evidenceDocumentIds: string[];
  movedMoney: false;
};

export type SimulatedCharge = {
  charged: false;
  movedMoney: false;
  duplicate: boolean;
  eventKeys: string[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function decideOperation(input: {
  action: OperationAction;
  serviceType: string;
  asOf: string;
  policy: OperationPolicy | null;
  contract: OperationContract;
  authorization: OperationAuthorization;
  evidenceDocumentIds?: readonly string[];
}): OperationDecision {
  const evidenceDocumentIds = [...(input.evidenceDocumentIds ?? [])];
  if (input.authorization?.revokedAt != null && input.authorization.revokedAt.trim() !== "") {
    return decision(input, "BLOCKED", ["REVOKED"], evidenceDocumentIds, input.policy);
  }
  const policy = applicablePolicy(input.policy);
  if (!policy) {
    return decision(input, "REVIEW", ["NO_POLICY"], evidenceDocumentIds, null);
  }
  if (policy.serviceType !== input.serviceType) {
    return decision(input, "REVIEW", ["DIFFERENT_SERVICE"], evidenceDocumentIds, policy);
  }
  if (!policy.reviewed) {
    return decision(input, "REVIEW", ["NOT_REVIEWED"], evidenceDocumentIds, policy);
  }
  if (!inForce(policy, input.asOf)) {
    return decision(input, "REVIEW", ["EXPIRED"], evidenceDocumentIds, policy);
  }
  if (input.contract == null || !input.contract.signed || input.contract.version.trim() === "") {
    return decision(input, "REVIEW", ["MISSING_CONTRACT"], evidenceDocumentIds, policy);
  }
  if (input.authorization == null) {
    return decision(input, "REVIEW", ["MISSING_AUTHORIZATION"], evidenceDocumentIds, policy);
  }
  if (input.action === "CHARGE_SERVICE" && !policy.chargeAllowed) {
    return decision(input, "REVIEW", ["CHARGE_NOT_ALLOWED"], evidenceDocumentIds, policy);
  }
  return decision(input, "ALLOWED", [], evidenceDocumentIds, policy);
}

export function simulateCharge(input: {
  decision: OperationDecision;
  idempotencyKey: string;
  priorEventKeys: readonly string[];
}): SimulatedCharge {
  const eventKeys = [...input.priorEventKeys];
  const key = input.idempotencyKey.trim();
  if (key !== "" && eventKeys.includes(key)) {
    return { charged: false, movedMoney: false, duplicate: true, eventKeys };
  }
  if (input.decision.status !== "ALLOWED" || key === "") {
    return { charged: false, movedMoney: false, duplicate: false, eventKeys };
  }
  return { charged: false, movedMoney: false, duplicate: false, eventKeys: [...eventKeys, key] };
}

function applicablePolicy(policy: OperationPolicy | null): OperationPolicy | null {
  if (!policy) return null;
  if (policy.id.trim() === "" || !Number.isInteger(policy.version) || policy.version <= 0) return null;
  return policy;
}

function inForce(policy: OperationPolicy, asOf: string): boolean {
  if (!DATE.test(asOf) || !DATE.test(policy.effectiveFrom) || !DATE.test(policy.effectiveUntil)) return false;
  if (policy.effectiveFrom > policy.effectiveUntil) return false;
  return asOf >= policy.effectiveFrom && asOf <= policy.effectiveUntil;
}

function decision(
  input: { action: OperationAction; serviceType: string },
  status: OperationStatus,
  reasons: string[],
  evidenceDocumentIds: string[],
  policy: OperationPolicy | null,
): OperationDecision {
  return {
    version: OPERATION_POLICY_VERSION,
    action: input.action,
    status,
    serviceType: input.serviceType,
    policyId: policy?.id ?? null,
    policyVersion: policy?.version ?? null,
    reasons,
    evidenceDocumentIds,
    movedMoney: false,
  };
}
