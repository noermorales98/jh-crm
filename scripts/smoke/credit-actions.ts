/**
 * Acciones del plan: orden fijo, sin carta y sin puntos.
 *
 *   npm run smoke:credit-actions
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  ACTION_POLICY_VERSION,
  buildCreditActions,
  closeCreditAction,
  confineActionDraft,
  type ActionPlanInput,
} from "../../src/lib/credit/actions";
import { ANOMALY_NOT_INACCURACY } from "../../src/lib/credit/anomalies";
import { AU_LIMIT_NOT_CAPACITY } from "../../src/lib/credit/ownership";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function input(patch: Partial<ActionPlanInput> = {}): ActionPlanInput {
  return {
    clientId: "client-a",
    snapshotId: "snap-1",
    coverage: "UNKNOWN",
    missingFields: [],
    interviews: [],
    scenario: null,
    discrepancies: [],
    authorizedUsers: [],
    ...patch,
  };
}

function main() {
  console.log("\n[credit-actions] buildCreditActions");
  check("versión", ACTION_POLICY_VERSION === "t19-2026-10-21");

  const full = input({
    interviews: [
      { observationId: "obs-i", state: "DRAFT" },
      { observationId: "obs-c", state: "CLOSED_NO_ACTION" },
    ],
    scenario: {
      aggregateStatus: "KNOWN",
      targetBps: 1000,
      paydownCents: 650000,
      observationIds: ["obs-s"],
    },
    discrepancies: [{ canonicalId: "canon-d", observationIds: ["obs-d"] }],
    authorizedUsers: [{ canonicalId: "canon-au", observationIds: ["obs-au"] }],
  });
  const reading = buildCreditActions(full, []);
  check(
    "el orden es entrevista, datos, obligación, usuario autorizado y diferencia",
    reading.map((action) => action.kind).join(",") ===
      "INTERVIEW,VERIFY_DATA,OBLIGATION,DESCRIBE_AU,REVIEW_DISCREPANCY",
    reading.map((action) => action.kind),
  );
  check(
    "ninguna acción promete puntos ni abre carta",
    reading.every(
      (action) =>
        action.predictedScorePoints === null &&
        action.createsDispute === false &&
        action.dueAt === null &&
        action.policyVersion === ACTION_POLICY_VERSION,
    ),
  );
  check(
    "una respuesta correcta no genera carta",
    !reading.some((action) => action.observationIds.includes("obs-c")),
  );
  const discrepancy = reading.find((action) => action.kind === "REVIEW_DISCREPANCY");
  check(
    "una diferencia no prueba inexactitud",
    discrepancy?.summary === ANOMALY_NOT_INACCURACY && discrepancy.provesInaccuracy === false,
  );
  const authorized = reading.find((action) => action.kind === "DESCRIBE_AU");
  check(
    "el usuario autorizado no trae un monto",
    authorized?.summary === AU_LIMIT_NOT_CAPACITY && !authorized.summary.includes("$"),
  );

  const partial = buildCreditActions(input({ coverage: "PARTIAL" }), []);
  check(
    "un dato incompleto pide revisión",
    partial[0]?.kind === "VERIFY_DATA" && partial[0]?.reasonCodes.includes("COVERAGE"),
  );
  const known = buildCreditActions(
    input({
      coverage: "COMPLETE",
      scenario: { aggregateStatus: "PARTIAL", targetBps: 1000, paydownCents: 100, observationIds: [] },
    }),
    [],
  );
  check("sin agregado conocido no hay obligación", known.every((action) => action.kind !== "OBLIGATION"));

  const again = buildCreditActions(full, reading);
  const keys = new Set(again.map((action) => action.idempotencyKey));
  check("recalcular no duplica la clave", keys.size === again.length && again.length === reading.length);

  const open = reading[0]!;
  const closed = closeCreditAction(open, "DONE", "revisado");
  const kept = buildCreditActions(full, [{ ...closed, ownerId: "staff-1", dueAt: "2026-04-01" }]);
  const stored = kept.find((action) => action.idempotencyKey === closed.idempotencyKey);
  check(
    "una acción cerrada conserva responsable, fecha, estado y nota",
    stored?.status === "DONE" &&
      stored.reviewNote === "revisado" &&
      stored.ownerId === "staff-1" &&
      stored.dueAt === "2026-04-01",
    stored,
  );
  const unchanged = closeCreditAction(closed, "DISMISSED", "  ");
  check("cerrar sin nota no cambia el estado", unchanged.status === "DONE" && unchanged.reviewNote === "revisado");

  const invented = confineActionDraft(reading, "Esto sube +40 puntos y la prioridad pasa a LOW.");
  check(
    "un texto que cambia un número no altera las acciones",
    invented.accepted === false && invented.actions === reading,
  );
  const faithful = confineActionDraft(reading, "El escenario pide 650000 centavos.");
  check("un texto fiel se acepta y no cambia las acciones", faithful.accepted === true && faithful.actions === reading);

  const view = readFileSync("src/components/clients/client-action-plan-view.tsx", "utf8");
  const pdf = readFileSync("src/lib/pdf/action-plan.ts", "utf8");
  check(
    "la ficha lista las acciones y no inventa puntos FICO",
    view.includes("plan.actions") &&
      view.includes("ACTION_PRIORITY_LABEL") &&
      view.includes("ACTION_PLAN_POINT_IMPACT_UNAVAILABLE"),
  );
  check(
    "el PDF lista acciones y no imprime puntos",
    pdf.includes("4. Acciones") && !pdf.includes("ficoImpact"),
  );

  console.log("\nOK credit-actions\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
