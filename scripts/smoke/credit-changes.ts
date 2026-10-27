/**
 * Cambios observados entre reportes, sin atribuir la causa.
 *
 *   npm run smoke:credit-changes
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import { compareReports, CHANGE_POLICY_VERSION, type ChangeObservation, type ChangeReport } from "../../src/lib/credit/changes";
import type { ScoreObservation } from "../../src/lib/credit/contracts";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function observation(patch: Partial<ChangeObservation> = {}): ChangeObservation {
  return {
    id: "obs",
    bureau: "EXPERIAN",
    canonicalId: "canon-1",
    identityConfirmed: true,
    balanceCents: null,
    formalDisposition: null,
    responseDocumentId: null,
    ...patch,
  };
}

function report(patch: Partial<ChangeReport> = {}): ChangeReport {
  return {
    reportId: "base",
    revision: 1,
    coverage: "COMPLETE",
    observations: [],
    scores: [],
    ...patch,
  };
}

function score(patch: Partial<ScoreObservation> = {}): ScoreObservation {
  return {
    bureau: "EXPERIAN",
    family: "FICO",
    version: "8",
    variant: "CLASSIC",
    value: 700,
    scoreDate: "2026-01-01",
    ...patch,
  };
}

function main() {
  console.log("\n[credit-changes] compareReports");
  check("versión", CHANGE_POLICY_VERSION === "t18-2026-10-21");

  const gone = compareReports(
    report({
      reportId: "rep-a",
      revision: 3,
      observations: [observation({ id: "old" })],
    }),
    report({ reportId: "rep-b", revision: 4, observations: [] }),
  );
  const missing = gone.changes[0];
  check(
    "la ausencia en dos reportes completos no es una eliminación",
    gone.policyVersion === CHANGE_POLICY_VERSION &&
      gone.baseReportId === "rep-a" &&
      gone.compareReportId === "rep-b" &&
      gone.baseRevision === 3 &&
      gone.compareRevision === 4 &&
      missing?.kind === "NOT_PRESENT" &&
      missing.formalDisposition === null &&
      missing.causalClaim === null,
    missing,
  );

  const partial = compareReports(
    report({ observations: [observation()] }),
    report({ reportId: "next", coverage: "PARTIAL" }),
  );
  check("un reporte parcial no certifica la ausencia", partial.changes[0]?.kind === "INSUFFICIENT_COVERAGE");

  const unknown = compareReports(
    report({ observations: [observation()] }),
    report({ reportId: "next", coverage: "UNKNOWN" }),
  );
  check("una cobertura desconocida no certifica la ausencia", unknown.changes[0]?.kind === "INSUFFICIENT_COVERAGE");

  const unconfirmed = compareReports(
    report({ observations: [observation({ identityConfirmed: false, id: "loose" })] }),
    report({ reportId: "next", observations: [observation({ identityConfirmed: false, id: "other", canonicalId: null })] }),
  );
  check(
    "una identidad sin confirmar no certifica ausencia ni alta",
    unconfirmed.changes.every((row) => row.kind === "INSUFFICIENT_COVERAGE") &&
      unconfirmed.changes.every((row) => row.kind !== "NOT_PRESENT" && row.kind !== "NEW"),
    unconfirmed.changes,
  );

  const balance = compareReports(
    report({ observations: [observation({ id: "before", balanceCents: 840000 })] }),
    report({
      reportId: "next",
      revision: 2,
      observations: [observation({ id: "after", balanceCents: 290000, canonicalId: "canon-1" })],
    }),
  );
  check(
    "el saldo observado baja 550000 centavos",
    balance.changes[0]?.kind === "UPDATED" && balance.changes[0]?.balanceDeltaCents === -550000,
    balance.changes[0],
  );

  const blankBalance = compareReports(
    report({ observations: [observation({ balanceCents: 100 })] }),
    report({ reportId: "next", observations: [observation({ id: "after", balanceCents: null })] }),
  );
  check("un saldo ausente no se vuelve cero", blankBalance.changes[0]?.balanceDeltaCents === null);

  const models = compareReports(
    report({ scores: [score()] }),
    report({
      reportId: "next",
      scores: [score({ family: "VANTAGE", scoreDate: "2026-02-01", value: 720 })],
    }),
  );
  check(
    "otro modelo deja el delta en null",
    models.scores[0]?.delta === null && models.scores[0]?.reason === "DIFFERENT_MODEL",
    models.scores[0],
  );

  const zero = compareReports(
    report({ scores: [score({ value: 0 })] }),
    report({ reportId: "next", scores: [score({ value: 710, scoreDate: "2026-02-01" })] }),
  );
  check("un score 0 no produce delta", zero.scores[0]?.delta === null);

  const verified = compareReports(
    report({ observations: [observation({ balanceCents: 500000 })] }),
    report({
      reportId: "next",
      observations: [
        observation({
          id: "after",
          balanceCents: 100000,
          formalDisposition: "VERIFIED",
          responseDocumentId: "doc-1",
        }),
      ],
    }),
  );
  const answered = verified.changes[0];
  check(
    "VERIFIED no cambia el tipo observado",
    answered?.kind === "UPDATED" &&
      answered.formalDisposition === "VERIFIED" &&
      answered.responseDocumentId === "doc-1" &&
      answered.causalClaim === null,
    answered,
  );

  const created = compareReports(
    report(),
    report({ reportId: "next", observations: [observation({ id: "fresh" })] }),
  );
  check("una cuenta nueva confirmada queda como alta", created.changes[0]?.kind === "NEW" && created.changes[0]?.causalClaim === null);

  const otherBureau = compareReports(
    report({ observations: [observation({ id: "exp", bureau: "EXPERIAN" })] }),
    report({
      reportId: "next",
      observations: [observation({ id: "eq", bureau: "EQUIFAX", canonicalId: "canon-1" })],
    }),
  );
  const kinds = otherBureau.changes.map((row) => `${row.bureau}:${row.kind}`).sort();
  check(
    "otro buró no se mezcla con la ausencia",
    kinds.includes("EXPERIAN:NOT_PRESENT") && kinds.includes("EQUIFAX:NEW") && !kinds.includes("EXPERIAN:UPDATED"),
    kinds,
  );

  const comparison = readFileSync("src/server/comparisons/index.ts", "utf8");
  const page = readFileSync("app/crm/clientes/[clientId]/_vistas-caso/comparaciones/[comparisonId]/page.tsx", "utf8");
  const pdf = readFileSync("src/lib/pdf/client-progress.ts", "utf8");
  const labels = readFileSync("src/lib/labels.ts", "utf8");
  check("la comparación guardada sigue en DELETED", comparison.includes('if (base && !compare) return "DELETED"'));
  check(
    "la pantalla no llama eliminación a la ausencia",
    page.includes('label="No presentes"') &&
      page.includes("ABSENCE_NOT_DELETION") &&
      page.includes("COVERAGE_NOT_CERTIFIED") &&
      page.includes("OBSERVED_DIFFERENCE") &&
      !page.includes("text-success-ink"),
  );
  check(
    "el PDF conserva el outcome y niega la atribución",
    pdf.includes('row("Eliminados"') && pdf.includes("PROGRESS_OUTCOME_NOTE"),
  );
  check(
    "el outcome de disputa sigue diciendo Eliminado",
    labels.includes('DELETED: "Eliminado"') && labels.includes('DELETED: "No presente"'),
  );

  console.log("\nOK credit-changes\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
