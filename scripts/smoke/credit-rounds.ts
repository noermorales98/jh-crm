/**
 * Rondas: borrador, recepción y plazo sin 30 días.
 *
 *   npm run smoke:credit-rounds
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  ROUND_TIMING_VERSION,
  recordOfficialResponse,
  recordSend,
  roundTiming,
  type RoundTimingInput,
} from "../../src/lib/credit/rounds";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function timing(patch: Partial<RoundTimingInput> = {}): RoundTimingInput {
  return {
    phase: "SENT",
    sentAt: "2026-01-01",
    receivedAt: null,
    estimatedReceivedAt: null,
    deadlinePolicyId: null,
    deadlinePolicyVersion: null,
    policyDurationDays: null,
    receptionRequired: true,
    ...patch,
  };
}

function main() {
  console.log("\n[credit-rounds] roundTiming");
  check("versión", ROUND_TIMING_VERSION === "t17-2026-10-21");

  const draft = roundTiming(timing({ phase: "DRAFT", sentAt: "2026-01-01" }));
  check("un borrador no aparece como enviado", draft.appearsSent === false && draft.sentAt === null, draft);

  const late = roundTiming(timing());
  check(
    "el tracking tardío no inventa recepción ni plazo",
    late.reception === "UNKNOWN" && late.dueAt === null && late.dueAtStatus === "UNDETERMINED",
    late,
  );

  const estimated = roundTiming(timing({ estimatedReceivedAt: "2026-01-10" }));
  check(
    "una recepción estimada no es la real",
    estimated.reception === "ESTIMATED" && estimated.receivedAt === null && estimated.dueAt === null,
  );

  const known = roundTiming(
    timing({
      receivedAt: "2026-01-05",
      deadlinePolicyId: "bureau-mail",
      deadlinePolicyVersion: 1,
      policyDurationDays: 10,
    }),
  );
  check(
    "una política con versión usa su propia duración",
    known.dueAt === "2026-01-15" && known.dueAtStatus === "VERIFIED_POLICY",
    known,
  );

  const noPolicy = roundTiming(timing({ receivedAt: "2026-01-05", policyDurationDays: 30 }));
  check("sin política no suma 30 días", noPolicy.dueAt === null && noPolicy.dueAtStatus === "UNDETERMINED");

  const pdf = recordOfficialResponse({
    source: "PDF",
    disposition: "DELETED",
    actorId: "staff",
    reason: "el reporte ya no la muestra",
    documentId: "doc",
    clientId: "client-a",
    organizationId: "org-a",
    document: { clientId: "client-a", organizationId: "org-a", revoked: false },
  });
  check("una lectura de PDF no es la respuesta oficial", pdf.applied === false && pdf.block === "INFERRED" && pdf.disposition === null);

  const incomplete = recordOfficialResponse({
    source: "OFFICIAL",
    disposition: "UPDATED",
    actorId: "staff",
    reason: "",
    documentId: "doc",
    clientId: "client-a",
    organizationId: "org-a",
    document: { clientId: "client-a", organizationId: "org-a", revoked: false },
  });
  check("un override sin motivo no se aplica", incomplete.applied === false && incomplete.block === "INCOMPLETE");

  const foreign = recordOfficialResponse({
    source: "OFFICIAL",
    disposition: "UPDATED",
    actorId: "staff",
    reason: "carta del buró",
    documentId: "doc-b",
    clientId: "client-a",
    organizationId: "org-a",
    document: { clientId: "client-b", organizationId: "org-a", revoked: false },
  });
  check("un documento de otro cliente no entra", foreign.applied === false && foreign.block === "DOCUMENT");

  const revoked = recordSend(
    {
      idempotencyKey: "send-1",
      channel: "MAIL",
      recipient: "experian",
      authorized: true,
      assertionReady: true,
      clientId: "client-a",
      organizationId: "org-a",
      document: { clientId: "client-a", organizationId: "org-a", revoked: true },
    },
    [],
  );
  check("un documento revocado no se envía", revoked.sent === false && revoked.block === "DOCUMENT");

  const simulator = recordSend(
    {
      idempotencyKey: "send-2",
      channel: "SIMULATOR",
      recipient: "experian",
      authorized: true,
      assertionReady: true,
      clientId: "client-a",
      organizationId: "org-a",
      document: null,
    },
    [],
  );
  check("el simulador no envía", simulator.sent === false && simulator.simulated === true);

  const retry = recordSend(
    {
      idempotencyKey: "send-2",
      channel: "EXTERNAL",
      recipient: "experian",
      authorized: true,
      assertionReady: true,
      clientId: "client-a",
      organizationId: "org-a",
      document: null,
    },
    ["send-2"],
  );
  check("repetir la clave no crea otro envío", retry.duplicate === true && retry.sent === false);

  const unauthorized = recordSend(
    {
      idempotencyKey: "send-4",
      channel: "EXTERNAL",
      recipient: "experian",
      authorized: false,
      assertionReady: true,
      clientId: "client-a",
      organizationId: "org-a",
      document: null,
    },
    [],
  );
  check("el canal externo sin autorización no sale", unauthorized.sent === false && unauthorized.block === "UNAUTHORIZED");

  const blocked = recordSend(
    {
      idempotencyKey: "send-3",
      channel: "EXTERNAL",
      recipient: "experian",
      authorized: false,
      assertionReady: false,
      clientId: "client-a",
      organizationId: "org-a",
      document: null,
    },
    [],
  );
  check("sin afirmación lista no cuenta como envío", blocked.sent === false && blocked.block === "NOT_READY");

  const automation = readFileSync("src/server/automations/index.ts", "utf8");
  const panel = readFileSync("src/components/rounds/round-detail-panel.tsx", "utf8");
  check(
    "el seguimiento ya no suma 30 días",
    !automation.includes("getUTCDate() + 30"),
  );
  check(
    "el panel deja el plazo pendiente",
    panel.includes("DUE_UNDETERMINED_LABEL") && panel.includes("Revisión indicada"),
  );

  console.log("\nOK credit-rounds\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
