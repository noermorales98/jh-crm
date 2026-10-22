/**
 * Afirmaciones: sí, no y no sé, sin disputa ni motivo inventado.
 *
 *   npm run smoke:credit-assertions
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  ASSERTION_VERSION,
  assessAssertion,
  confineDraft,
  factLines,
  type AssertionInput,
} from "../../src/lib/credit/assertions";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function input(patch: Partial<AssertionInput> = {}): AssertionInput {
  return {
    creditItemId: "item-1",
    field: "negativeType",
    bureau: "EXPERIAN",
    reportedValue: "CHARGE_OFF",
    consumerClaim: null,
    answer: null,
    evidenceDocumentIds: [],
    documents: [],
    clientId: "client-a",
    organizationId: "org-a",
    expectedRevision: 3,
    currentRevision: 3,
    clientActorId: "client-user",
    reviewerId: null,
    ...patch,
  };
}

function main() {
  console.log("\n[credit-assertions] assessAssertion");
  check("versión", ASSERTION_VERSION === "t16-2026-10-21");

  const unanswered = assessAssertion(input());
  check("sin respuesta queda en borrador", unanswered.state === "DRAFT" && unanswered.block === null && unanswered.letterReady === false);

  const correct = assessAssertion(input({ answer: "CORRECT", consumerClaim: "es correcto" }));
  check(
    "correcto cierra sin acción y sin motivo de carta",
    correct.state === "CLOSED_NO_ACTION" &&
      correct.letterReason === null &&
      correct.createsDispute === false &&
      correct.sendsLetter === false,
    correct,
  );

  const unknown = assessAssertion(input({ answer: "UNKNOWN", consumerClaim: "no estoy seguro" }));
  check("no sé no confirma", unknown.state === "DRAFT" && unknown.block === "UNKNOWN" && unknown.letterReady === false);

  const missing = assessAssertion(input({ answer: "INCORRECT", consumerClaim: "  " }));
  check("no sin texto sigue en borrador", missing.state === "DRAFT" && missing.block === "MISSING_CLAIM");

  const claimed = assessAssertion(input({ answer: "INCORRECT", consumerClaim: "Esa cuenta no es mía" }));
  check("no con texto confirma al cliente", claimed.state === "CLIENT_CONFIRMED" && claimed.staffReviewed === false);

  const otherClient = assessAssertion(
    input({
      answer: "INCORRECT",
      consumerClaim: "Esa cuenta no es mía",
      evidenceDocumentIds: ["doc-b"],
      documents: [{ id: "doc-b", clientId: "client-b", organizationId: "org-a", revoked: false }],
    }),
  );
  check("documento de otro cliente no se acepta", otherClient.state === "DRAFT" && otherClient.block === "DOCUMENT_SCOPE");

  const revoked = assessAssertion(
    input({
      answer: "CORRECT",
      evidenceDocumentIds: ["doc-a"],
      documents: [{ id: "doc-a", clientId: "client-a", organizationId: "org-a", revoked: true }],
    }),
  );
  check("documento revocado no avanza", revoked.state === "DRAFT" && revoked.block === "DOCUMENT_REVOKED");

  const stale = assessAssertion(input({ answer: "CORRECT", expectedRevision: 2, currentRevision: 3 }));
  check("revisión distinta no avanza", stale.state === "DRAFT" && stale.block === "STALE_REVISION");

  const sameReviewer = assessAssertion(
    input({
      answer: "INCORRECT",
      consumerClaim: "Esa cuenta no es mía",
      reviewerId: "client-user",
    }),
  );
  check(
    "el revisor no puede ser quien respondió",
    sameReviewer.state === "CLIENT_CONFIRMED" && sameReviewer.block === "SAME_REVIEWER" && sameReviewer.staffReviewed === false,
  );

  const reviewed = assessAssertion(
    input({
      answer: "INCORRECT",
      consumerClaim: "Esa cuenta no es mía",
      reviewerId: "staff-user",
    }),
  );
  check(
    "otro revisor deja el borrador de carta listo",
    reviewed.state === "LETTER_READY" && reviewed.staffReviewed === true && reviewed.letterReady === true && reviewed.sendsLetter === false,
  );

  const lines = factLines({ field: "saldo", bureau: "", reportedValue: null, consumerClaim: null });
  check("un campo ausente no se rellena", lines.length === 1 && lines[0] === "campo: saldo");

  const invented = confineDraft("La identidad robada ocurrió el 2020-01-01 y pagué $500.", ["campo: saldo"]);
  check("un borrador que inventa motivo se rechaza", invented.rejected && invented.text === null, invented);

  const faithful = confineDraft("campo: saldo\nreportado: CHARGE_OFF", ["campo: saldo", "reportado: CHARGE_OFF"]);
  check("un borrador con hechos confirmados se conserva", faithful.rejected === false && faithful.text?.includes("CHARGE_OFF") === true);

  const panel = readFileSync("src/components/clients/client-negative-analysis-panel.tsx", "utf8");
  check(
    "el análisis pregunta sin marcar no y no crea disputa",
    panel.includes("¿El dato reportado es correcto?") &&
      panel.includes("No crea una disputa.") &&
      !panel.includes("defaultChecked") &&
      !panel.includes("addDisputeItems"),
  );

  console.log("\nOK credit-assertions\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
