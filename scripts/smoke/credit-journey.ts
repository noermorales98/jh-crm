/**
 * Recorrido sintético de crédito, con la activación apagada.
 *
 *   npm run smoke:credit-journey
 *
 * Sin red, sin DATABASE_URL y sin Stripe.
 */
import { readFileSync } from "node:fs";
import { ACTIVATION_VERSION, activationGate } from "../../src/lib/credit/activation";
import { assessAssertion } from "../../src/lib/credit/assertions";
import { isCreditIdentityReadEnabled } from "../../src/lib/credit/backfill";
import { allocateUtilizationBudget } from "../../src/lib/credit/budget";
import { assessCapacity } from "../../src/lib/credit/capacity";
import { compareReports } from "../../src/lib/credit/changes";
import { scoreDelta } from "../../src/lib/credit/contracts";
import { computeFundingEstimate } from "../../src/lib/credit/funding-estimate";
import { proposeIdentity, splitIdentity } from "../../src/lib/credit/identity";
import { metricText, presentUtilization } from "../../src/lib/credit/metrics-view";
import { decideOperation } from "../../src/lib/credit/operations";
import { buildPortalView } from "../../src/lib/credit/portal-view";
import { evaluateProgram } from "../../src/lib/credit/programs";
import { buildRevolvingReading, type RevolvingObservation } from "../../src/lib/credit/revolving";
import { recordOfficialResponse, recordSend } from "../../src/lib/credit/rounds";
import { paydownCents, buildUtilizationScenario } from "../../src/lib/credit/score-plan";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function card(
  partial: Partial<RevolvingObservation> & Pick<RevolvingObservation, "id" | "canonicalId">,
): RevolvingObservation {
  return {
    creditorName: "Visa",
    bureau: "EXPERIAN",
    accountType: "revolving",
    responsibility: "individual",
    accountStatus: "Open",
    balanceCents: 800_000,
    limitCents: 1_000_000,
    currency: "USD",
    reportDate: "2024-06-01",
    identityStatus: "CONFIRMED",
    ...partial,
  };
}

function main() {
  console.log("\n[credit-journey] recorrido");
  check("versión", ACTIVATION_VERSION === "t28-2026-10-22");

  const proposed = proposeIdentity([
    {
      id: "a",
      organizationId: "org-a",
      clientId: "client-1",
      reportId: "rep-1",
      bureau: "EXPERIAN",
      creditorName: "Visa",
      suffix: "4242",
      openedMonth: "2019-04",
      family: "REVOLVING",
    },
    {
      id: "b",
      organizationId: "org-a",
      clientId: "client-1",
      reportId: "rep-1",
      bureau: "EQUIFAX",
      creditorName: "Visa",
      suffix: "4242",
      openedMonth: "2020-01",
      family: "REVOLVING",
    },
  ]);
  check("fechas distintas no confirman la identidad", proposed.groups.every((group) => group.status !== "CONFIRMED"));

  const payment = paydownCents(800_000, 1_000_000, 1_000);
  const scenario = buildUtilizationScenario({
    snapshotId: "snap-1",
    targetBps: 1_000,
    aggregateStatus: "KNOWN",
    accounts: [{
      canonicalId: "visa",
      creditorName: "Visa",
      balanceCents: 800_000,
      limitCents: 1_000_000,
      currency: "USD",
    }],
  });
  check(
    "10000 y 8000 al 10% piden 7000 y no predicen puntos",
    payment === 700_000 && scenario.aggregatePaydownCents === 700_000 && scenario.scorePrediction == null,
  );

  const abc = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      card({ id: "a", canonicalId: "a", balanceCents: 800_000, limitCents: 1_000_000 }),
      card({ id: "b", canonicalId: "b", bureau: "EQUIFAX", balanceCents: 50_000, limitCents: 500_000 }),
      card({ id: "c", canonicalId: "c", bureau: "TRANSUNION", balanceCents: 0, limitCents: 500_000 }),
    ],
  });
  check(
    "A, B y C se leen 42.5%",
    abc.consolidated.individual.valueBps === 4_250 &&
      metricText(presentUtilization({ basisPoints: abc.consolidated.individual.valueBps, status: "KNOWN" })) === "42.5%",
  );

  const budget = allocateUtilizationBudget({
    snapshotId: "snap-1",
    extraBudgetCents: 200_000,
    aggregateStatus: "KNOWN",
    accounts: [
      { canonicalId: "a", creditorName: "A", balanceCents: 800_000, limitCents: 1_000_000, currency: "USD" },
      { canonicalId: "b", creditorName: "B", balanceCents: 200_000, limitCents: 500_000, currency: "USD" },
      { canonicalId: "c", creditorName: "C", balanceCents: 30_000, limitCents: 500_000, currency: "USD" },
    ],
  });
  check(
    "el presupuesto de ejemplo se lee 41.5%",
    budget.simulatedUtilizationBps === 4_150 &&
      metricText(presentUtilization({ basisPoints: budget.simulatedUtilizationBps, status: "KNOWN" })) === "41.5%",
  );

  const capacity = assessCapacity({
    clientId: "client-1",
    organizationId: "org-a",
    canViewSensitive: true,
    currency: "USD",
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    grossMonthlyIncomeCents: 600_000,
    debtCoverage: "COMPLETE",
    obligations: [{
      canonicalId: "canon-1",
      identityConfirmed: true,
      authorizedUser: false,
      paymentCents: 180_000,
      currency: "USD",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    }],
    sourceDocumentIds: ["doc-1"],
    documents: [{ id: "doc-1", clientId: "client-1", organizationId: "org-a", revoked: false }],
    reviewState: "CONFIRMED",
    eligibleFlowCents: null,
    debtServiceCents: null,
    flowPeriodStart: null,
    flowPeriodEnd: null,
    flowCurrency: null,
    serviceCurrency: null,
    allowNegativeFlow: false,
  });
  check("180000 sobre 600000 son 30% y no hay préstamo", capacity.dtiBps === 3_000 && capacity.loanAmountCents == null);

  const unknownRule = evaluateProgram(
    {
      programId: "demo",
      version: 1,
      source: "INTERNAL",
      sourceLabel: "interno",
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2026-12-31",
      organizationId: "org-a",
      clientId: "client-1",
      reviewed: true,
      bureaus: ["EXPERIAN"],
      rules: [{ id: "score", required: true, operator: "MIN_SCORE", threshold: 700, family: "FICO", version: "8", variant: "standard" }],
    },
    {
      snapshotId: "snap-1",
      asOf: "2026-06-01",
      organizationId: "org-a",
      clientId: "client-1",
      bureaus: [{ bureau: "EXPERIAN", score: null, ageMonths: null, balanceCents: null, limitCents: null }],
    },
  );
  const differentModel = scoreDelta(
    { bureau: "EXPERIAN", family: "FICO", version: "8", variant: "standard", value: 700, scoreDate: "2024-01-01" },
    { bureau: "EXPERIAN", family: "VANTAGE", version: "3", variant: "standard", value: 700, scoreDate: "2024-06-01" },
  );
  check(
    "un dato desconocido queda en revisión y otro modelo no tiene delta",
    unknownRule.status === "REVIEW" &&
      unknownRule.approvedAmount == null &&
      unknownRule.requirements[0]?.result !== "PASS" &&
      differentModel.delta == null,
  );

  const interview = assessAssertion({
    creditItemId: "item-1",
    field: "balance",
    bureau: "EXPERIAN",
    reportedValue: "8000",
    consumerClaim: "El saldo no es mío",
    answer: "INCORRECT",
    evidenceDocumentIds: [],
    documents: [],
    clientId: "client-1",
    organizationId: "org-a",
    expectedRevision: 1,
    currentRevision: 1,
    clientActorId: "client-1",
    reviewerId: null,
  });
  const simulated = recordSend({
    idempotencyKey: "send-1",
    channel: "SIMULATOR",
    recipient: "buró",
    authorized: false,
    assertionReady: true,
    clientId: "client-1",
    organizationId: "org-a",
    document: null,
  }, []);
  const pdf = recordOfficialResponse({
    source: "PDF",
    disposition: "VERIFIED",
    actorId: "user-1",
    reason: "leído",
    documentId: "doc-1",
    clientId: "client-1",
    organizationId: "org-a",
    document: { clientId: "client-1", organizationId: "org-a", revoked: false },
  });
  const compared = compareReports(
    {
      reportId: "base",
      revision: 1,
      coverage: "COMPLETE",
      observations: [{
        id: "gone",
        bureau: "EXPERIAN",
        canonicalId: "visa-1",
        identityConfirmed: true,
        balanceCents: 800_000,
        formalDisposition: null,
        responseDocumentId: null,
      }],
      scores: [],
    },
    { reportId: "next", revision: 2, coverage: "PARTIAL", observations: [], scores: [] },
  );
  check(
    "la entrevista, el simulador y el PDF no crean efecto externo",
    interview.createsDispute === false &&
      simulated.sent === false &&
      pdf.applied === false &&
      compared.changes[0]?.causalClaim == null,
  );

  const charge = decideOperation({
    action: "CHARGE_SERVICE",
    serviceType: "CREDIT_REPAIR",
    asOf: "2026-06-01",
    policy: null,
    contract: null,
    authorization: null,
  });
  const foreign = buildPortalView({
    actor: { organizationId: "org-a", authenticatedClientId: "client-a", revokedAt: null, expiresAt: null },
    asOf: "2026-06-01",
    clientId: "client-b",
    organizationId: "org-a",
    publication: "CONFIRMED",
    basisPoints: 4_250,
    scenarioTargetBps: null,
    document: { clientId: "client-b", organizationId: "org-a", title: "Documento de B", revoked: false },
    interview: null,
  });
  const partial = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [card({ id: "partial", canonicalId: "partial", limitCents: null })],
  });
  const partialText = metricText(presentUtilization({
    basisPoints: partial.consolidated.individual.valueBps,
    status: partial.consolidated.individual.status === "KNOWN" ? "KNOWN" : "UNKNOWN",
  }));
  check(
    "sin política no se cobra, el ajeno no se entrega y lo parcial no es 0%",
    charge.status === "REVIEW" &&
      charge.movedMoney === false &&
      foreign.visible === false &&
      !JSON.stringify(foreign).includes("Documento de B") &&
      partial.consolidated.individual.status !== "KNOWN" &&
      partialText !== "0%" &&
      partialText !== "0.0%",
  );

  const split = splitIdentity({
    actor: { organizationId: "org-a", role: "STAFF" },
    clientId: "client-1",
    identity: {
      observationIds: ["a", "b"],
      canonicalId: "can-ab",
      status: "CONFIRMED",
      signals: ["SUFFIX"],
      conflicts: [],
      reviewedBy: "user-1",
      identityVersion: 1,
    },
    observations: [
      {
        id: "a",
        organizationId: "org-a",
        clientId: "client-1",
        reportId: "rep-1",
        bureau: "EXPERIAN",
        creditorName: "Visa",
        suffix: "4242",
        openedMonth: "2019-04",
        family: "REVOLVING",
      },
      {
        id: "b",
        organizationId: "org-a",
        clientId: "client-1",
        reportId: "rep-1",
        bureau: "EQUIFAX",
        creditorName: "Visa",
        suffix: "4242",
        openedMonth: "2019-04",
        family: "REVOLVING",
      },
    ],
    detachIds: ["b"],
    reviewedBy: "user-1",
  });
  const estimate = computeFundingEstimate();
  const gate = activationGate({
    migrationApplied: true,
    corpusPassed: true,
    journeyPassed: true,
    isolationPassed: true,
    telemetryReady: true,
    policyReviewed: false,
    programReviewed: false,
  });
  check(
    "la lectura sigue apagada y faltan política y programa",
    isCreditIdentityReadEnabled("org-a") === false &&
      isCreditIdentityReadEnabled("org-a", ["org-a"]) === true &&
      isCreditIdentityReadEnabled("org-b", ["org-a"]) === false &&
      split.detached.observationIds.includes("b") &&
      estimate.amount == null &&
      estimate.status === "UNAVAILABLE" &&
      gate.ready === false &&
      !gate.reasons.includes("MIGRATION") &&
      gate.reasons.includes("POLICY") &&
      gate.reasons.includes("PROGRAM"),
  );

  const ready = activationGate({
    migrationApplied: true,
    corpusPassed: true,
    journeyPassed: true,
    isolationPassed: true,
    telemetryReady: true,
    policyReviewed: true,
    programReviewed: true,
  });
  const fallback = computeFundingEstimate();
  check(
    "una compuerta lista no reabre el monto",
    ready.ready === true && fallback.amount == null,
  );

  const source = readFileSync("src/lib/credit/activation.ts", "utf8");
  check("la compuerta no escribe configuración", !source.includes("OrganizationSettings") && !source.includes("process.env"));

  console.log("\nOK credit-journey\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
