/**
 * Identidad entre burós: candidatos, revisión y split.
 *
 *   npm run smoke:credit-identity
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  compareObservations,
  confirmIdentity,
  isExtractionDuplicate,
  proposeIdentity,
  splitIdentity,
  type IdentityObservation,
} from "../../src/lib/credit/identity";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function obs(partial: Partial<IdentityObservation> & Pick<IdentityObservation, "id" | "bureau">): IdentityObservation {
  return {
    organizationId: "org-a",
    clientId: "client-1",
    reportId: "rep-1",
    creditorName: "VISA",
    suffix: "4242",
    openedMonth: "2019-04",
    family: "REVOLVING",
    balanceCents: 100,
    ...partial,
  };
}

function main() {
  console.log("\n[credit-identity] candidatos");

  const visa = [
    obs({ id: "visa-ex", bureau: "EXPERIAN", balanceCents: 100 }),
    obs({ id: "visa-eq", bureau: "EQUIFAX", balanceCents: 250 }),
    obs({ id: "visa-tu", bureau: "TRANSUNION", balanceCents: 80 }),
  ];
  const visaProposal = proposeIdentity(visa);
  check("Visa en tres burós es una propuesta", visaProposal.groups.length === 1);
  check("la propuesta no se confirma sola", visaProposal.groups[0]?.status === "PROPOSED" && visaProposal.groups[0]?.canonicalId == null);
  check("el saldo distinto no separa la Visa", visaProposal.groups[0]?.observationIds.length === 3);

  const chase = proposeIdentity([
    obs({ id: "chase-1", bureau: "EXPERIAN", creditorName: "CHASE", suffix: "1111", openedMonth: "2020-01" }),
    obs({ id: "chase-2", bureau: "EQUIFAX", creditorName: "CHASE", suffix: "1111", openedMonth: "2021-06" }),
  ]);
  check("dos Chase con el mismo sufijo y otra apertura no se unen", chase.groups.length === 0);
  const chasePair = compareObservations(
    obs({ id: "chase-1", bureau: "EXPERIAN", creditorName: "CHASE", suffix: "1111", openedMonth: "2020-01" }),
    obs({ id: "chase-2", bureau: "EQUIFAX", creditorName: "CHASE", suffix: "1111", openedMonth: "2021-06" }),
  );
  check("la apertura distinta queda en revisión", chasePair.outcome === "REVIEW" && chasePair.reasons.includes("OPENED_CONFLICT"));

  const aliased = proposeIdentity(
    [
      obs({ id: "alias-a", bureau: "EXPERIAN", creditorName: "Trial Bank NA" }),
      obs({ id: "alias-b", bureau: "EQUIFAX", creditorName: "Trial Bank" }),
    ],
    [{ from: "Trial Bank NA", to: "Trial Bank" }],
  );
  check("el alias permite proponer", aliased.groups.length === 1 && aliased.groups[0]?.status === "PROPOSED");

  const missing = proposeIdentity([
    obs({ id: "miss-a", bureau: "EXPERIAN", creditorName: null }),
    obs({ id: "miss-b", bureau: "EQUIFAX", creditorName: null }),
  ]);
  check("sin acreedor no hay candidato", missing.groups.length === 0);

  const abc = proposeIdentity([
    obs({ id: "a", bureau: "EXPERIAN", family: "REVOLVING" }),
    obs({ id: "b", bureau: "EQUIFAX", family: null }),
    obs({ id: "c", bureau: "TRANSUNION", family: "INSTALLMENT" }),
  ]);
  check("A-B-C contradictorio no nace una sola cuenta", abc.groups.every((group) => group.observationIds.length < 3));
  check("el conflicto transitivo queda visible", abc.conflicts.includes("TRANSITIVE_CONFLICT"));

  const duplicate = isExtractionDuplicate(
    obs({ id: "dup-1", bureau: "EXPERIAN", reportId: "rep-9" }),
    obs({ id: "dup-2", bureau: "EXPERIAN", reportId: "rep-9" }),
  );
  check("la fila repetida es duplicado de extracción", duplicate);
  const duplicateProposal = proposeIdentity([
    obs({ id: "dup-1", bureau: "EXPERIAN", reportId: "rep-9" }),
    obs({ id: "dup-2", bureau: "EQUIFAX", reportId: "rep-9" }),
  ]);
  check("otro buró del mismo reporte sí puede proponerse", duplicateProposal.groups.length === 1);

  const actor = { organizationId: "org-a", role: "STAFF" as const };
  const confirmed = confirmIdentity({
    actor,
    clientId: "client-1",
    observations: visa,
    review: "CONFIRMED",
    reviewedBy: "user-1",
  });
  check("la revisión explícita confirma", confirmed.identity.status === "CONFIRMED" && confirmed.identity.identityVersion === 1);
  check("el merge deja auditoría", confirmed.audit.action === "IDENTITY_MERGE");

  const split = splitIdentity({
    actor,
    clientId: "client-1",
    identity: confirmed.identity,
    observations: visa,
    detachIds: ["visa-tu"],
    reviewedBy: "user-1",
  });
  check("el split restaura dos identidades", split.kept.canonicalId !== split.detached.canonicalId);
  check("el split sube la versión", split.kept.identityVersion === 2 && split.detached.identityVersion === 2);
  check("el split deja auditoría", split.audit.action === "IDENTITY_SPLIT");
  check(
    "las observaciones quedan separadas",
    !split.kept.observationIds.includes("visa-tu") && split.detached.observationIds.includes("visa-tu"),
  );

  let crossed = false;
  try {
    confirmIdentity({
      actor,
      clientId: "client-1",
      observations: [obs({ id: "x", bureau: "EXPERIAN", organizationId: "org-b" })],
      review: "CONFIRMED",
      reviewedBy: "user-1",
    });
  } catch (error) {
    crossed = error instanceof Error && error.message === "SCOPE_MISMATCH";
  }
  check("otro tenant no se confirma", crossed);

  const plan = readFileSync("src/server/credit-reports/action-plan.ts", "utf8");
  check(
    "el plan sigue deduplicando por fila",
    plan.includes("${item.creditorName}|${item.bureau}|${limit}|${balance}"),
  );
  check("el plan no importa la identidad", !plan.includes("credit/identity"));

  console.log("\nOK credit-identity\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
