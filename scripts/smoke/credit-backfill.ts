/**
 * Backfill de identidades y snapshot consolidado.
 *
 *   npm run smoke:credit-backfill
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import { confirmIdentity, splitIdentity, type IdentityObservation } from "../../src/lib/credit/identity";
import {
  applyBackfillPage,
  buildConsolidatedSnapshot,
  dryRunBackfill,
  isCreditIdentityReadEnabled,
  type BackfillObservation,
} from "../../src/lib/credit/backfill";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function row(
  partial: Partial<BackfillObservation> & Pick<BackfillObservation, "id" | "bureau">,
): BackfillObservation {
  return {
    organizationId: "org-a",
    clientId: "client-1",
    reportId: "rep-1",
    creditorName: "VISA",
    suffix: "4242",
    openedMonth: "2019-04",
    family: "REVOLVING",
    balanceCents: 100,
    reportDate: "2024-01-15",
    creditLimitCents: 10_000,
    canonicalTradelineId: null,
    ...partial,
  };
}

function asIdentity(item: BackfillObservation): IdentityObservation {
  return item;
}

function main() {
  console.log("\n[credit-backfill] recorrido");

  const actor = { organizationId: "org-a", role: "STAFF" as const };
  const visa = [
    row({ id: "b", bureau: "EQUIFAX", reportDate: "2024-02-01", balanceCents: 200, creditLimitCents: 10_000 }),
    row({ id: "a", bureau: "EXPERIAN", reportDate: "2024-01-01", balanceCents: 100, creditLimitCents: 10_000 }),
    row({ id: "c", bureau: "TRANSUNION", reportDate: "2024-03-01", balanceCents: 300, creditLimitCents: 10_000 }),
  ];
  const pending = row({
    id: "p",
    bureau: "EXPERIAN",
    creditorName: "OTHER",
    suffix: "9999",
    openedMonth: "2022-01",
    reportId: "rep-2",
  });
  const observations = [...visa, pending];
  const confirmed = confirmIdentity({
    actor,
    clientId: "client-1",
    observations: visa.map(asIdentity),
    review: "CONFIRMED",
    reviewedBy: "user-1",
  }).identity;

  const before = observations.map((item) => item.canonicalTradelineId);
  const dry = dryRunBackfill({
    actor,
    clientId: "client-1",
    observations,
    confirmed: [confirmed],
  });
  check("el dry-run no muta", observations.every((item, index) => item.canonicalTradelineId === before[index]));
  check("el dry-run cuenta la pendiente", dry.observationCount === 4 && dry.pending === 1 && dry.confirmed === 1);

  const claims = new Map<string, string>();
  const first = applyBackfillPage({
    actor,
    clientId: "client-1",
    observations,
    confirmed: [confirmed],
    checkpoint: { cursor: null, linkedCount: 0 },
    pageSize: 2,
    workerId: "worker-a",
    claims,
  });
  const rival = applyBackfillPage({
    actor,
    clientId: "client-1",
    observations,
    confirmed: [confirmed],
    checkpoint: { cursor: null, linkedCount: 0 },
    pageSize: 2,
    workerId: "worker-b",
    claims,
  });
  check("el primer worker avanza", first.advanced && first.claimed && first.links.length === 2);
  check("el segundo worker no reclama la misma página", rival.claimed === false && rival.links.length === 0);

  const linked = new Map(first.links.map((link) => [link.observationId, link.canonicalId]));
  const afterFirst = observations.map((item) => ({
    ...item,
    canonicalTradelineId: linked.get(item.id) ?? item.canonicalTradelineId,
  }));
  const resumed = applyBackfillPage({
    actor,
    clientId: "client-1",
    observations: afterFirst,
    confirmed: [confirmed],
    checkpoint: first.checkpoint,
    pageSize: 2,
    workerId: "worker-a",
    claims: new Map(),
  });
  check("la reanudación enlaza el resto confirmado", resumed.links.length === 1);
  check("la pendiente no se enlaza", resumed.links.every((link) => link.observationId !== "p"));

  const done = afterFirst.map((item) => {
    const link = resumed.links.find((entry) => entry.observationId === item.id);
    return link ? { ...item, canonicalTradelineId: link.canonicalId } : item;
  });
  const again = applyBackfillPage({
    actor,
    clientId: "client-1",
    observations: done,
    confirmed: [confirmed],
    checkpoint: { cursor: null, linkedCount: 0 },
    pageSize: 10,
    workerId: "worker-a",
    claims: new Map(),
  });
  check("la segunda pasada no suma enlaces", again.links.length === 0);

  const snapshot = buildConsolidatedSnapshot({
    actor,
    clientId: "client-1",
    creditCaseId: "case-1",
    observations: done,
    confirmed: [confirmed],
    confirmedReportIds: ["rep-1"],
    asOf: "2024-06-01",
  });
  check("tres límites de 10000 siguen siendo 10000", snapshot.accounts.length === 1 && snapshot.accounts[0]?.creditLimitCents === 10_000);
  check("usa la observación más reciente", snapshot.accounts[0]?.observationId === "c");
  check("el snapshot guarda la política y la versión", snapshot.selectionPolicyVersion === "t06-selection-2026-10-20" && snapshot.identityVersion === 1);

  const early = buildConsolidatedSnapshot({
    actor,
    clientId: "client-1",
    creditCaseId: "case-1",
    observations: done,
    confirmed: [confirmed],
    confirmedReportIds: ["rep-1"],
    asOf: "2024-01-15",
  });
  check("asOf excluye el futuro", early.accounts[0]?.observationId === "a");
  check("el snapshot posterior no reescribe el anterior", snapshot.accounts[0]?.observationId === "c");

  const futureOnly = buildConsolidatedSnapshot({
    actor,
    clientId: "client-1",
    creditCaseId: "case-1",
    observations: done,
    confirmed: [confirmed],
    confirmedReportIds: ["rep-1"],
    asOf: "2023-01-01",
  });
  check("sin observación vigente la cobertura queda incompleta", futureOnly.coverage === "INCOMPLETE");

  const outside = buildConsolidatedSnapshot({
    actor,
    clientId: "client-1",
    creditCaseId: "case-1",
    observations: done,
    confirmed: [confirmed],
    confirmedReportIds: ["rep-other"],
    asOf: "2024-06-01",
  });
  check("no arrastra un reporte ajeno sin aviso", outside.warnings.includes("OUTSIDE_CONFIRMED_REPORTS") && outside.accounts.length === 0);

  const split = splitIdentity({
    actor,
    clientId: "client-1",
    identity: confirmed,
    observations: visa.map(asIdentity),
    detachIds: ["c"],
    reviewedBy: "user-1",
  });
  const revised = buildConsolidatedSnapshot({
    actor,
    clientId: "client-1",
    creditCaseId: "case-1",
    observations: done,
    confirmed: [split.kept, split.detached],
    confirmedReportIds: ["rep-1"],
    asOf: "2024-06-01",
  });
  check("el split publica otra vista", revised.accounts.length === 2 && revised.identityVersion === 2);
  check("el snapshot anterior sigue en una cuenta", snapshot.accounts.length === 1 && snapshot.identityVersion === 1);

  let crossed = false;
  try {
    dryRunBackfill({
      actor,
      clientId: "client-1",
      observations: [row({ id: "x", bureau: "EXPERIAN", organizationId: "org-b" })],
      confirmed: [],
    });
  } catch (error) {
    crossed = error instanceof Error && error.message === "SCOPE_MISMATCH";
  }
  check("otro tenant no se recorre", crossed);
  check("la lectura v2 nace apagada", isCreditIdentityReadEnabled("org-a") === false);
  check("otra organización no se enciende sola", isCreditIdentityReadEnabled("org-b", ["org-a"]) === false);

  const plan = readFileSync("src/server/credit-reports/action-plan.ts", "utf8");
  check("el plan no importa el backfill", !plan.includes("credit/backfill"));

  console.log("\nOK credit-backfill\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
