/**
 * Decisión de envío y cobro.
 *
 *   npm run smoke:credit-operations
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  OPERATION_POLICY_VERSION,
  decideOperation,
  simulateCharge,
  type OperationPolicy,
} from "../../src/lib/credit/operations";
import { DomainError } from "../../src/server/errors";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

const policy: OperationPolicy = {
  id: "pol-1",
  version: 1,
  reviewed: true,
  serviceType: "CREDIT_REPAIR",
  effectiveFrom: "2026-01-01",
  effectiveUntil: "2026-12-31",
  chargeAllowed: false,
};

const signed = { version: "2026-1", signed: true };
const consent = { revokedAt: null };

function main() {
  console.log("\n[credit-operations] decideOperation");
  check("versión", OPERATION_POLICY_VERSION === "t25-2026-10-21");

  const missing = decideOperation({
    action: "SEND_DISPUTE",
    serviceType: "CREDIT_REPAIR",
    asOf: "2026-06-01",
    policy: null,
    contract: signed,
    authorization: consent,
  });
  check("sin política queda en revisión", missing.status === "REVIEW" && missing.reasons.includes("NO_POLICY") && missing.movedMoney === false);

  const noContract = decideOperation({
    action: "SEND_DISPUTE",
    serviceType: "CREDIT_REPAIR",
    asOf: "2026-06-01",
    policy,
    contract: null,
    authorization: consent,
  });
  check("sin contrato queda en revisión", noContract.status === "REVIEW" && noContract.reasons.includes("MISSING_CONTRACT"));

  const noConsent = decideOperation({
    action: "SEND_DISPUTE",
    serviceType: "CREDIT_REPAIR",
    asOf: "2026-06-01",
    policy,
    contract: signed,
    authorization: null,
  });
  check(
    "una autorización vacía no es consentimiento",
    noConsent.status === "REVIEW" && noConsent.reasons.includes("MISSING_AUTHORIZATION"),
  );

  const revoked = decideOperation({
    action: "CHARGE_SERVICE",
    serviceType: "CREDIT_REPAIR",
    asOf: "2026-06-01",
    policy: { ...policy, chargeAllowed: true },
    contract: signed,
    authorization: { revokedAt: "2026-05-01" },
  });
  check("una revocación bloquea", revoked.status === "BLOCKED" && revoked.reasons.includes("REVOKED"));

  const expired = decideOperation({
    action: "SEND_DISPUTE",
    serviceType: "CREDIT_REPAIR",
    asOf: "2027-01-01",
    policy,
    contract: signed,
    authorization: consent,
  });
  check("una política vencida no autoriza", expired.status === "REVIEW" && expired.reasons.includes("EXPIRED"));

  const otherService = decideOperation({
    action: "CHARGE_SERVICE",
    serviceType: "HOME_BUYER",
    asOf: "2026-06-01",
    policy,
    contract: signed,
    authorization: consent,
  });
  check(
    "otro servicio no queda bloqueado por reparación de crédito",
    otherService.status === "REVIEW" &&
      otherService.reasons.includes("DIFFERENT_SERVICE"),
  );

  const charge = decideOperation({
    action: "CHARGE_SERVICE",
    serviceType: "CREDIT_REPAIR",
    asOf: "2026-06-01",
    policy,
    contract: signed,
    authorization: consent,
  });
  check("el cobro no permitido sigue en revisión", charge.status === "REVIEW" && charge.reasons.includes("CHARGE_NOT_ALLOWED"));

  const allowed = decideOperation({
    action: "SEND_DISPUTE",
    serviceType: "CREDIT_REPAIR",
    asOf: "2026-06-01",
    policy,
    contract: signed,
    authorization: consent,
  });
  check("un envío completo queda permitido", allowed.status === "ALLOWED" && allowed.reasons.length === 0 && allowed.movedMoney === false);

  const first = simulateCharge({ decision: allowed, idempotencyKey: "chg-1", priorEventKeys: [] });
  const retry = simulateCharge({ decision: allowed, idempotencyKey: "chg-1", priorEventKeys: first.eventKeys });
  const refused = simulateCharge({ decision: charge, idempotencyKey: "chg-2", priorEventKeys: [] });
  check(
    "el reintento simulado no crea otro evento ni mueve dinero",
    first.charged === false &&
      first.movedMoney === false &&
      first.eventKeys.length === 1 &&
      retry.duplicate === true &&
      retry.eventKeys.length === 1 &&
      refused.eventKeys.length === 0 &&
      refused.movedMoney === false,
    { first, retry, refused },
  );

  const source = readFileSync("src/lib/credit/operations.ts", "utf8");
  const panel = readFileSync("src/components/rounds/round-detail-panel.tsx", "utf8");
  const workspace = readFileSync("src/components/rounds/embedded-round-workspace.tsx", "utf8");
  const roundsServer = readFileSync("src/server/rounds/index.ts", "utf8");
  const actionsUi = readFileSync("src/components/rounds/round-actions.tsx", "utf8");
  const paymentsIndex = readFileSync("src/server/payments/index.ts", "utf8");
  const stripePay = readFileSync("src/server/payments/stripe.ts", "utf8");
  check(
    "no hay un plazo de 3 días",
    !source.includes("3 días") && !source.includes("5 días") && !source.includes("cancellationDays") && !source.includes("score"),
  );
  check(
    "markRoundSent exige contrato firmado",
    roundsServer.includes("assertSignedContract") && !roundsServer.includes("decideOperation"),
  );
  check(
    "lo ya cobrado siempre se registra; la compuerta va antes del enlace de pago",
    !paymentsIndex.includes("assertChargeAllowed") &&
      !stripePay.includes("assertChargeAllowed") &&
      stripePay.indexOf("assertSignedContract(ctx.organizationId, quote.clientId") <
        stripePay.indexOf("requireStripeClient", stripePay.indexOf("export async function startQuoteCheckout")),
  );
  check(
    "onRoundSent deja rastro si falla tras SENT",
    roundsServer.includes("ROUND_SENT_AUTOMATION_FAILED") &&
      roundsServer.includes("onRoundSent_failed"),
  );

  check(
    "la UI no ofrece enviar sin contrato firmado",
    actionsUi.includes("sendAllowed") && actionsUi.includes("sendBlockedReason"),
  );
  check(
    "la ronda muestra el contrato y conserva el plazo sin política",
    panel.includes("Contrato firmado") &&
      panel.includes("getSignedContractGate") &&
      panel.includes("deadlinePolicyId: null") &&
      panel.includes("RoundActions") &&
      panel.includes("sendAllowed={sendGate.allowed}"),
  );
  check(
    "la ronda visible repite el plazo y el contrato",
    workspace.includes("Plazo legal") &&
      workspace.includes("Contrato firmado") &&
      workspace.includes("roundTiming") &&
      workspace.includes("DUE_UNDETERMINED_LABEL") &&
      workspace.includes("deadlinePolicyId: null") &&
      workspace.includes("RoundActions") &&
      workspace.includes("sendAllowed={sendGate.allowed}") &&
      !workspace.includes("30 días"),
  );

  console.log("\nOK credit-operations\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
