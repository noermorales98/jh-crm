/**
 * Lectura del portal para el cliente de la sesión.
 *
 *   npm run smoke:credit-portal
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import type { AssertionInput } from "../../src/lib/credit/assertions";
import { PROGRESS_OUTCOME_NOTE } from "../../src/lib/credit/changes";
import {
  PORTAL_VIEW_VERSION,
  SCENARIO_IS_SIMULATION,
  buildPortalView,
  type PortalViewInput,
} from "../../src/lib/credit/portal-view";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

const actor = {
  organizationId: "org-a",
  authenticatedClientId: "client-a",
  revokedAt: null,
  expiresAt: "2026-12-31",
};

function request(patch: Partial<PortalViewInput>): PortalViewInput {
  return {
    actor,
    asOf: "2026-06-01",
    clientId: "client-a",
    organizationId: "org-a",
    publication: "CONFIRMED",
    basisPoints: 3841,
    scenarioTargetBps: 1000,
    document: {
      clientId: "client-a",
      organizationId: "org-a",
      title: "Documento propio",
      revoked: false,
    },
    interview: null,
    ...patch,
  };
}

function interview(answer: AssertionInput["answer"], claim: string | null): AssertionInput {
  return {
    creditItemId: "item-1",
    field: "balance",
    bureau: "EXPERIAN",
    reportedValue: "100",
    consumerClaim: claim,
    answer,
    evidenceDocumentIds: [],
    documents: [],
    clientId: "client-a",
    organizationId: "org-a",
    expectedRevision: 1,
    currentRevision: 1,
    clientActorId: "client-a",
    reviewerId: null,
  };
}

function main() {
  console.log("\n[credit-portal] buildPortalView");
  check("versión", PORTAL_VIEW_VERSION === "t23-2026-10-21");

  const foreign = buildPortalView(request({
    clientId: "client-b",
    document: {
      clientId: "client-b",
      organizationId: "org-a",
      title: "Documento de B",
      revoked: false,
    },
  }));
  const foreignJson = JSON.stringify(foreign);
  check(
    "el documento de otro cliente no se entrega",
    foreign.visible === false &&
      foreign.reason === "SCOPE" &&
      foreign.documentTitle === null &&
      !foreignJson.includes("Documento de B") &&
      !foreignJson.includes("38.4"),
    foreign,
  );

  const otherOrg = buildPortalView(request({ organizationId: "org-b" }));
  check("otra organización queda vacía", otherOrg.visible === false && otherOrg.reason === "SCOPE" && otherOrg.documentTitle === null);

  const expired = buildPortalView(request({
    actor: { ...actor, expiresAt: "2026-01-01" },
    asOf: "2026-01-02",
  }));
  check("un enlace vencido no autoriza", expired.visible === false && expired.reason === "EXPIRED" && expired.documentTitle === null);

  const revoked = buildPortalView(request({
    actor: { ...actor, revokedAt: "2026-05-01" },
  }));
  check("un acceso revocado no autoriza", revoked.visible === false && revoked.reason === "REVOKED" && revoked.documentTitle === null);

  const draft = buildPortalView(request({ publication: "DRAFT" }));
  const draftJson = JSON.stringify(draft);
  check(
    "un borrador no publica la cifra",
    draft.reason === "DRAFT" && draft.formattedUtilization === null && !draftJson.includes("38.4") && !draftJson.includes("0%"),
    draft,
  );

  const published = buildPortalView(request({}));
  const keys = Object.keys(published);
  check(
    "lo confirmado se lee 38.4% y no es un monto aprobado",
    published.formattedUtilization === "38.4%" &&
      published.approvedAmount === null &&
      published.scorePrediction === null &&
      published.scenarioLabel === SCENARIO_IS_SIMULATION &&
      published.deltaIsSuccess === false &&
      published.progressNote === PROGRESS_OUTCOME_NOTE &&
      !keys.includes("ruleset") &&
      !keys.includes("override") &&
      !keys.includes("internalNote"),
    published,
  );

  const pending = buildPortalView(request({ interview: interview("UNKNOWN", null) }));
  const corrected = buildPortalView(request({ interview: interview("INCORRECT", "El saldo no es mío") }));
  check(
    "corregir la entrevista no crea una disputa",
    pending.interview?.state === "DRAFT" &&
      pending.interview.createsDispute === false &&
      corrected.interview?.state === "CLIENT_CONFIRMED" &&
      corrected.interview.createsDispute === false,
    { pending: pending.interview, corrected: corrected.interview },
  );

  const page = readFileSync("app/portal/(app)/progreso/page.tsx", "utf8");
  const interviewFile = readFileSync("src/components/portal/portal-progress-interview.tsx", "utf8");
  check(
    "el progreso no pinta el delta como logro",
    page.includes("PROGRESS_OUTCOME_NOTE") &&
      page.includes("SCENARIO_IS_SIMULATION") &&
      page.includes("PortalProgressInterview") &&
      !page.includes("text-success-ink") &&
      !page.includes('tone="green"') &&
      !page.includes("buildUtilizationScenario"),
  );
  check(
    "la entrevista no se guarda ni abre una disputa",
    interviewFile.includes("assessAssertion") && interviewFile.includes("No crea una disputa."),
  );

  console.log("\nOK credit-portal\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
