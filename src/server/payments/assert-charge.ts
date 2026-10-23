/**
 * Compuerta fail-closed de cobro de servicio de crédito.
 * Sin política revisada / contrato / autorización → DomainError (REVIEW o BLOCKED).
 */
import {
  decideOperation,
  OPERATION_REVIEW_LABEL,
  type OperationAuthorization,
  type OperationContract,
  type OperationPolicy,
} from "@/src/lib/credit/operations";
import { DomainError } from "@/src/server/errors";

export type ChargeGateInput = {
  serviceType?: string;
  asOf?: string;
  policy?: OperationPolicy | null;
  contract?: OperationContract;
  authorization?: OperationAuthorization;
  evidenceDocumentIds?: readonly string[];
};

export function assertChargeAllowed(input: ChargeGateInput = {}): void {
  const decision = decideOperation({
    action: "CHARGE_SERVICE",
    serviceType: input.serviceType?.trim() || "CREDIT_REPAIR",
    asOf: input.asOf?.trim() || new Date().toISOString().slice(0, 10),
    policy: input.policy ?? null,
    contract: input.contract ?? null,
    authorization: input.authorization ?? null,
    evidenceDocumentIds: input.evidenceDocumentIds,
  });
  if (decision.status === "ALLOWED") return;
  const reasons =
    decision.reasons.length > 0
      ? decision.reasons.join(", ")
      : decision.status;
  throw new DomainError(
    decision.status === "BLOCKED"
      ? `Cobro bloqueado: ${reasons}.`
      : `${OPERATION_REVIEW_LABEL}: no se puede cobrar el servicio (${reasons}).`,
  );
}
