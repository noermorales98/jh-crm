/**
 * Corpus sintético F01–F30.
 *
 *   npm run smoke:credit-corpus
 *
 * Sin red, sin DATABASE_URL y sin un PDF de una persona real.
 */
import { EXTRACTION_ITEM_CEILING } from "../../src/lib/validation/credit-import";
import { assessExtractionCoverage } from "../../src/server/credit-import/extract";
import { buildAnomalyReading, type AnomalyObservation } from "../../src/lib/credit/anomalies";
import { allocateUtilizationBudget } from "../../src/lib/credit/budget";
import { compareReports } from "../../src/lib/credit/changes";
import { scoreDelta, type ScoreObservation } from "../../src/lib/credit/contracts";
import { proposeIdentity, type IdentityObservation } from "../../src/lib/credit/identity";
import { presentUtilization } from "../../src/lib/credit/metrics-view";
import { parseLocalizedMoney, normalizeCreditorName } from "../../src/lib/credit/normalize";
import { buildOwnershipSummary, type OwnershipObservation } from "../../src/lib/credit/ownership";
import { evaluateProgram, type ProgramFacts, type ProgramRuleset } from "../../src/lib/credit/programs";
import { confirmReview } from "../../src/lib/credit/review";
import { buildRevolvingReading, type RevolvingObservation } from "../../src/lib/credit/revolving";
import { recordOfficialResponse, recordSend } from "../../src/lib/credit/rounds";
import { assertCreditAccess } from "../../src/lib/credit/access";
import { temporalMetrics } from "../../src/lib/credit/temporal";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function card(partial: Partial<RevolvingObservation> & Pick<RevolvingObservation, "id" | "bureau">): RevolvingObservation {
  return {
    creditorName: "Visa",
    accountType: "revolving",
    responsibility: "individual",
    accountStatus: "Open",
    balanceCents: 800_000,
    limitCents: 1_000_000,
    currency: "USD",
    reportDate: "2024-06-01",
    canonicalId: "visa-1",
    identityStatus: "CONFIRMED",
    ...partial,
  };
}

function person(partial: Partial<IdentityObservation> & Pick<IdentityObservation, "id">): IdentityObservation {
  return {
    organizationId: "org-a",
    clientId: "client-1",
    reportId: "rep-1",
    bureau: "EXPERIAN",
    creditorName: "Visa",
    suffix: "4242",
    openedMonth: "2019-04",
    family: "REVOLVING",
    ...partial,
  };
}

function anomaly(partial: Partial<AnomalyObservation> & Pick<AnomalyObservation, "id" | "bureau">): AnomalyObservation {
  return {
    canonicalId: "visa-1",
    identityStatus: "CONFIRMED",
    creditorName: "Visa",
    balanceCents: 800_000,
    dateReported: "2024-06-01",
    responsibility: "individual",
    ownershipConfirmed: true,
    paymentStatus: "CHARGE_OFF",
    isNegative: true,
    negativeType: "CHARGE_OFF",
    ...partial,
  };
}

function score(partial: Partial<ScoreObservation> & Pick<ScoreObservation, "family">): ScoreObservation {
  return {
    bureau: "EXPERIAN",
    version: "8",
    variant: null,
    value: 700,
    scoreDate: "2024-01-01",
    ...partial,
  };
}

function ruleset(partial: Partial<ProgramRuleset> = {}): ProgramRuleset {
  return {
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
    rules: [{
      id: "score",
      required: true,
      operator: "MIN_SCORE",
      threshold: 700,
      family: "FICO",
      version: "8",
      variant: null,
    }],
    ...partial,
  };
}

function facts(partial: Partial<ProgramFacts> = {}): ProgramFacts {
  return {
    snapshotId: "snap-1",
    asOf: "2026-06-01",
    organizationId: "org-a",
    clientId: "client-1",
    bureaus: [{
      bureau: "EXPERIAN",
      score: { value: 720, family: "FICO", version: "8", variant: null },
      ageMonths: 40,
      balanceCents: 0n,
      limitCents: 1n,
    }],
    ...partial,
  };
}

function main() {
  console.log("\n[credit-corpus] F01–F30");

  const f01 = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: ["EXPERIAN", "EQUIFAX", "TRANSUNION"].map((bureau) => card({ id: bureau, bureau })),
  });
  check(
    "F01 una Visa confirmada es una cuenta de 1000000 y 800000",
    f01.consolidated.cards.length === 1 &&
      f01.consolidated.individual.limitCents === 1_000_000 &&
      f01.consolidated.individual.balanceCents === 800_000 &&
      !("scorePrediction" in f01),
  );

  const f02pair = proposeIdentity([
    person({ id: "a", openedMonth: "2019-04" }),
    person({ id: "b", bureau: "EQUIFAX", openedMonth: "2020-01" }),
  ]);
  check(
    "F02 fechas distintas no se unen solas",
    f02pair.groups.every((group) => group.status !== "CONFIRMED") && f02pair.groups.length === 0,
  );

  const f03 = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      card({ id: "rev", bureau: "EXPERIAN" }),
      card({ id: "home", bureau: "EXPERIAN", accountType: "mortgage", canonicalId: "home-1", balanceCents: 20_000_000, limitCents: 30_000_000 }),
    ],
  });
  check(
    "F03 la hipoteca no entra en la utilización",
    f03.consolidated.cards.length === 1 && f03.consolidated.cards[0]?.canonicalId === "visa-1",
  );

  const au = ["EXPERIAN", "EQUIFAX", "TRANSUNION"].map((bureau) => ({
    ...card({ id: `au-${bureau}`, bureau, canonicalId: "au-1", responsibility: "authorized user", balanceCents: 100, limitCents: 500_000 }),
    ownershipConfirmed: true,
    opened: null,
    reportedNegative: false,
  })) satisfies OwnershipObservation[];
  const f04 = buildOwnershipSummary({ asOf: "2024-06-01", observations: au });
  const f04use = buildRevolvingReading({ asOf: "2024-06-01", observations: au });
  check(
    "F04 una AU en tres burós no entra en la primaria",
    f04.auCanonicalIds.length === 1 && f04use.consolidated.cards.length === 0,
  );

  const f05 = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [card({ id: "nolimit", bureau: "EXPERIAN", limitCents: null })],
  });
  check(
    "F05 un límite ausente deja el total parcial",
    f05.consolidated.individual.status === "PARTIAL" &&
      f05.consolidated.individual.valueBps == null &&
      f05.consolidated.cards[0]?.utilizationBps == null,
  );

  const f06 = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [card({ id: "zero", bureau: "EXPERIAN", balanceCents: 0 })],
  });
  check(
    "F06 saldo cero con límite es 0 y el dato está",
    f06.consolidated.individual.status === "KNOWN" && f06.consolidated.individual.valueBps === 0,
  );

  const f07 = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [card({ id: "charge", bureau: "EXPERIAN", accountType: "charge card" })],
  });
  check(
    "F07 una tarjeta de cargo no entra en la utilización estándar",
    f07.consolidated.individual.status === "NOT_APPLICABLE" && f07.consolidated.individual.valueBps == null,
  );

  const f08 = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [card({ id: "over", bureau: "EXPERIAN", balanceCents: 1_500_000 })],
  });
  check(
    "F08 por encima del límite no se recorta a 100%",
    f08.consolidated.individual.valueBps != null && f08.consolidated.individual.valueBps > 10_000,
  );

  const f09 = scoreDelta(
    score({ family: "FICO", variant: "standard" }),
    score({ family: "VANTAGE", version: "3", variant: "standard", scoreDate: "2024-06-01" }),
  );
  check("F09 FICO y Vantage no tienen delta", f09.delta == null && f09.reason === "DIFFERENT_MODEL");

  const f10 = scoreDelta(score({ family: null }), score({ family: null, scoreDate: "2024-06-01" }));
  const f10rule = evaluateProgram(ruleset(), facts({
    bureaus: [{
      bureau: "EXPERIAN",
      score: { value: 720, family: null, version: null, variant: null },
      ageMonths: 40,
      balanceCents: 0n,
      limitCents: 1n,
    }],
  }));
  check(
    "F10 sin modelo no pasa la regla",
    f10.delta == null &&
      f10.reason === "MISSING_MODEL" &&
      f10rule.requirements[0]?.result === "UNKNOWN" &&
      f10rule.approvedAmount == null,
  );

  const f11 = temporalMetrics({
    asOf: "2024-06-01",
    accounts: [{ opened: { year: 2025, month: 1, day: 1, precision: "DAY" }, closed: false, authorizedUser: false }],
    windowMonths: 12,
  });
  const f11rule = evaluateProgram(
    ruleset({ rules: [{ id: "age", required: true, operator: "MIN_AGE_MONTHS", threshold: 12, family: null, version: null, variant: null }] }),
    facts({ bureaus: [{ bureau: "EXPERIAN", score: null, ageMonths: f11.oldestMonths, balanceCents: null, limitCents: null }] }),
  );
  check(
    "F11 una apertura futura no pasa",
    f11.oldestMonths == null && f11rule.requirements[0]?.result !== "PASS",
  );

  const f12 = temporalMetrics({
    asOf: "2024-06-01",
    accounts: [],
    windowMonths: 12,
    inquiries: [{ bureau: "EXPERIAN", inquiredOn: "2024-05-01", kind: "SOFT" }],
  });
  check("F12 una consulta soft no cuenta como dura", f12.hardRawCount === 0);

  const f13 = temporalMetrics({
    asOf: "2024-06-01",
    accounts: [],
    inquiries: [{ bureau: "EXPERIAN", inquiredOn: "2024-05-01", kind: "HARD" }],
  });
  check(
    "F13 sin ventana la agrupación queda vacía",
    f13.groupedInformationalCount == null && f13.groupingPolicyVersion == null && f13.hardRawCount == null,
  );

  const f14 = buildAnomalyReading({
    coverage: "COMPLETE",
    negativeCount: 0,
    observations: [
      anomaly({ id: "june", bureau: "EXPERIAN", balanceCents: 400_000, dateReported: "2024-06-01", isNegative: false, negativeType: null, paymentStatus: "current" }),
      anomaly({ id: "july", bureau: "EQUIFAX", balanceCents: 100_000, dateReported: "2024-07-01", isNegative: false, negativeType: null, paymentStatus: "current" }),
    ],
  });
  check(
    "F14 fechas distintas no prueban inexactitud",
    f14.anomalies[0]?.temporalComparability === "DIFFERENT_DATES" && f14.anomalies.every((item) => item.provesInaccuracy === false),
  );

  const f15 = buildAnomalyReading({
    coverage: "COMPLETE",
    negativeCount: 2,
    observations: [
      anomaly({ id: "ex", bureau: "EXPERIAN" }),
      anomaly({ id: "eq", bureau: "EQUIFAX" }),
    ],
  });
  check(
    "F15 un negativo igual no se inventa como inexacto",
    f15.anomalies.length === 0 && f15.negativeReading === "PRESENT",
  );

  const f16 = compareReports(
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
    "F16 cobertura parcial no confirma una ausencia",
    f16.changes[0]?.kind === "INSUFFICIENT_COVERAGE" && f16.changes[0]?.causalClaim == null,
  );

  const kept = assessExtractionCoverage({
    plannedWindows: 1,
    validWindows: 1,
    plannedPages: 1,
    emptyPages: 0,
    omittedItems: 0,
    incompleteWindows: 0,
  });
  check(
    "F17 250 ítems dentro del techo no se bloquean",
    250 <= EXTRACTION_ITEM_CEILING && kept.status === "COMPLETE" && kept.metricsBlocked === false,
  );

  const claims = new Map();
  const published = confirmReview({
    actor: { organizationId: "org-a", role: "STAFF" },
    clientId: "client-1",
    resource: { organizationId: "org-a", clientId: "client-1" },
    review: null,
    expectedRevision: 0,
    idempotencyKey: "corpus-f18",
    reviewedFieldIds: ["report.reportDate"],
    identityDecisionIds: [],
    creditCaseId: "case-1",
    asOf: "2024-06-01",
    confirmedReportIds: ["rep-1"],
    reportDate: "2024-06-01",
    authorUserId: "user-1",
    reason: "revisión",
    claims,
  });
  const replay = confirmReview({
    actor: { organizationId: "org-a", role: "STAFF" },
    clientId: "client-1",
    resource: { organizationId: "org-a", clientId: "client-1" },
    review: published.review,
    expectedRevision: 0,
    idempotencyKey: "corpus-f18",
    reviewedFieldIds: ["report.reportDate"],
    identityDecisionIds: [],
    creditCaseId: "case-1",
    asOf: "2024-06-01",
    confirmedReportIds: ["rep-1"],
    reportDate: "2024-06-01",
    authorUserId: "user-1",
    reason: "revisión",
    claims,
  });
  check(
    "F18 la misma clave no confirma dos veces",
    published.outcome === "PUBLISHED" && replay.outcome === "REPLAY" && replay.review.reportId === published.review.reportId,
  );

  const secretTitle = "Documento secreto de A";
  let f19 = "";
  try {
    assertCreditAccess({
      actor: { organizationId: "org-b", role: "STAFF" },
      clientId: "client-1",
      resource: { organizationId: "org-a", clientId: "client-1" },
      mode: "view",
    });
    f19 = "entregado";
  } catch (error) {
    f19 = error instanceof Error ? error.message : "otro";
  }
  check("F19 otra organización no recibe el documento", f19 === "SCOPE_MISMATCH" && !f19.includes(secretTitle));

  const alias = [{ from: "Chase Bank", to: "Chase" }];
  const f20 = proposeIdentity([
    person({ id: "n1", creditorName: "Chase Bank", suffix: null, openedMonth: null }),
    person({ id: "n2", bureau: "EQUIFAX", creditorName: "CHASE", suffix: null, openedMonth: null }),
  ], alias);
  check(
    "F20 un alias propone y no confirma por el nombre",
    normalizeCreditorName("Chase Bank", alias) === "CHASE" &&
      f20.groups.length === 1 &&
      f20.groups[0]?.status === "PROPOSED" &&
      f20.groups[0]?.canonicalId == null,
  );

  const quiet = allocateUtilizationBudget({
    snapshotId: "snap-1",
    extraBudgetCents: 0,
    aggregateStatus: "KNOWN",
    accounts: [{ canonicalId: "a", creditorName: "Visa", balanceCents: 80_000, limitCents: 100_000, currency: "USD" }],
  });
  const large = allocateUtilizationBudget({
    snapshotId: "snap-1",
    extraBudgetCents: 200_000,
    aggregateStatus: "KNOWN",
    accounts: [{ canonicalId: "a", creditorName: "Visa", balanceCents: 80_000, limitCents: 100_000, currency: "USD" }],
  });
  check(
    "F21 el presupuesto cero no gasta y el saldo no baja de cero",
    quiet.complete === true &&
      quiet.spentCents === 0 &&
      quiet.cards[0]?.balanceCents === 80_000 &&
      large.complete === true &&
      (large.cards[0]?.balanceCents ?? -1) >= 0 &&
      (large.spentCents ?? 0) <= 200_000 &&
      (large.remainingCents ?? -1) >= 0,
  );

  const f22 = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [
      card({ id: "usd", bureau: "EXPERIAN", canonicalId: "usd", currency: "USD" }),
      card({ id: "eur", bureau: "EQUIFAX", canonicalId: "eur", currency: "EUR" }),
    ],
  });
  check(
    "F22 monedas distintas no forman un total",
    f22.consolidated.individual.valueBps == null &&
      f22.consolidated.discrepancies.some((item) => item.code === "MIXED_CURRENCY"),
  );

  const missing = presentUtilization({ basisPoints: null, status: "UNKNOWN" });
  const zero = presentUtilization({ basisPoints: 0, status: "KNOWN" });
  check(
    "F23 null no se muestra como 0%",
    missing.formattedValue == null && zero.formattedValue === "0.0%",
  );

  const emptyPage = assessExtractionCoverage({
    plannedWindows: 1,
    validWindows: 1,
    plannedPages: 2,
    emptyPages: 1,
    omittedItems: 0,
    incompleteWindows: 0,
  });
  let blocked = "";
  try {
    confirmReview({
      actor: { organizationId: "org-a", role: "STAFF" },
      clientId: "client-1",
      resource: { organizationId: "org-a", clientId: "client-1" },
      review: null,
      expectedRevision: 0,
      idempotencyKey: "corpus-f24",
      reviewedFieldIds: ["report.reportDate"],
      identityDecisionIds: [],
      creditCaseId: "case-1",
      asOf: "2024-06-01",
      confirmedReportIds: ["rep-1"],
      reportDate: "2024-06-01",
      authorUserId: "user-1",
      reason: "revisión",
      metricsBlocked: true,
    });
    blocked = "publicado";
  } catch (error) {
    blocked = error instanceof Error ? error.message : "otro";
  }
  check(
    "F24 una página vacía no bloquea; metricsBlocked sigue impidiendo publicar",
    emptyPage.status === "COMPLETE" && emptyPage.metricsBlocked === false && blocked === "PUBLICATION_BLOCKED",
  );

  const expired = evaluateProgram(ruleset(), facts({ asOf: "2027-01-01" }));
  const sourceless = evaluateProgram(ruleset({ source: null, sourceLabel: null }), facts());
  check(
    "F25 sin fuente o vencido queda en revisión y sin monto",
    expired.status === "REVIEW" &&
      expired.approvedAmount == null &&
      sourceless.status === "REVIEW" &&
      sourceless.approvedAmount == null &&
      expired.requirements.every((item) => item.result !== "PASS") &&
      sourceless.requirements.every((item) => item.result !== "PASS"),
  );

  const inferred = recordOfficialResponse({
    source: "PDF",
    disposition: "VERIFIED",
    actorId: "user-1",
    reason: "leído",
    documentId: "doc-1",
    clientId: "client-1",
    organizationId: "org-a",
    document: { clientId: "client-1", organizationId: "org-a", revoked: false },
  });
  const official = recordOfficialResponse({
    source: "OFFICIAL",
    disposition: "VERIFIED",
    actorId: "user-1",
    reason: "carta",
    documentId: "doc-1",
    clientId: "client-1",
    organizationId: "org-a",
    document: { clientId: "client-1", organizationId: "org-a", revoked: false },
  });
  check(
    "F26 un PDF no sustituye la respuesta oficial",
    inferred.applied === false && inferred.block === "INFERRED" && inferred.disposition == null && official.applied === true && official.disposition === "VERIFIED",
  );

  const once = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [card({ id: "same", bureau: "EXPERIAN" })],
  });
  const twice = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [card({ id: "same", bureau: "EXPERIAN" })],
  });
  check(
    "F27 la misma entrada da el mismo resultado",
    JSON.stringify(once.consolidated) === JSON.stringify(twice.consolidated),
  );

  const f28 = buildRevolvingReading({
    asOf: "2024-06-01",
    observations: [card({ id: "credit", bureau: "EXPERIAN", balanceCents: -500 })],
  });
  check(
    "F28 el saldo a favor se conserva y no entra en la suma",
    f28.consolidated.cards[0]?.rawBalanceCents === -500 &&
      f28.consolidated.individual.balanceCents == null &&
      f28.consolidated.discrepancies.some((item) => item.code === "CREDIT_BALANCE"),
  );

  const shipment = {
    idempotencyKey: "send-1",
    channel: "SIMULATOR" as const,
    recipient: "buró",
    authorized: false,
    assertionReady: true,
    clientId: "client-1",
    organizationId: "org-a",
    document: null,
  };
  const firstSend = recordSend(shipment, []);
  const retry = recordSend(shipment, ["send-1"]);
  check(
    "F29 la misma clave no repite el envío",
    firstSend.sent === false && firstSend.simulated === true && retry.duplicate === true && retry.sent === false,
  );

  const plainUs = parseLocalizedMoney("1,234.56", "rep-1", null, "USD");
  const plainEu = parseLocalizedMoney("1.234,56", "rep-1", null, "USD");
  check(
    "F30 sin locale los dos formatos no quedan como el mismo entero",
    !(plainUs.quality === "KNOWN" && plainEu.quality === "KNOWN" && plainUs.value?.cents === plainEu.value?.cents),
  );

  console.log("\nOK credit-corpus\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
