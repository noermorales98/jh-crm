/**
 * Programas versionados: PASS no es una aprobación y no hay monto.
 *
 *   npm run smoke:credit-programs
 *
 * Sin red y sin DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import {
  PROGRAM_MATCH_MEANING,
  PROGRAM_POLICY_VERSION,
  acceptRuleset,
  evaluateProgram,
  type BureauFacts,
  type ProgramFacts,
  type ProgramRule,
  type ProgramRuleset,
} from "../../src/lib/credit/programs";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

function rule(patch: Partial<ProgramRule> = {}): ProgramRule {
  return {
    id: "score",
    required: true,
    operator: "MIN_SCORE",
    threshold: 700,
    family: "FICO",
    version: "8",
    variant: "CLASSIC",
    ...patch,
  };
}

function ruleset(patch: Partial<ProgramRuleset> = {}): ProgramRuleset {
  return {
    programId: "demo",
    version: 1,
    source: "VERIFIED_LENDER",
    sourceLabel: "Acme",
    effectiveFrom: "2026-01-01",
    effectiveUntil: "2026-12-31",
    organizationId: "org-a",
    clientId: "client-a",
    reviewed: true,
    bureaus: ["EXPERIAN", "EQUIFAX"],
    rules: [rule()],
    ...patch,
  };
}

function bureau(patch: Partial<BureauFacts> = {}): BureauFacts {
  return {
    bureau: "EXPERIAN",
    score: { value: 720, family: "FICO", version: "8", variant: "CLASSIC" },
    ageMonths: 40,
    balanceCents: 1000n,
    limitCents: 10000n,
    ...patch,
  };
}

function facts(patch: Partial<ProgramFacts> = {}): ProgramFacts {
  return {
    snapshotId: "snap-1",
    asOf: "2026-06-01",
    organizationId: "org-a",
    clientId: "client-a",
    bureaus: [bureau(), bureau({ bureau: "EQUIFAX" })],
    ...patch,
  };
}

function main() {
  console.log("\n[credit-programs] evaluateProgram");
  check("versión", PROGRAM_POLICY_VERSION === "t20-2026-10-21");

  const matched = evaluateProgram(ruleset(), facts());
  check(
    "todos los obligatorios en PASS no son una aprobación ni un monto",
    matched.status === "PASS" &&
      matched.meaning === PROGRAM_MATCH_MEANING &&
      matched.approvedAmount === null &&
      matched.snapshotId === "snap-1" &&
      matched.internalDemo === false,
    matched,
  );

  const noSource = evaluateProgram(ruleset({ source: null, sourceLabel: null }), facts());
  check("sin fuente queda en revisión", noSource.status === "REVIEW" && noSource.requirements[0]?.reasonCode === "NO_SOURCE");

  const expired = evaluateProgram(ruleset(), facts({ asOf: "2027-01-02" }));
  check("una vigencia vencida no pasa", expired.status === "REVIEW" && expired.requirements[0]?.reasonCode === "EXPIRED");

  const otherModel = evaluateProgram(
    ruleset(),
    facts({
      bureaus: [
        bureau({ score: { value: 780, family: "VANTAGE", version: "3", variant: "CLASSIC" } }),
        bureau({ bureau: "EQUIFAX", score: { value: 780, family: "VANTAGE", version: "3", variant: "CLASSIC" } }),
      ],
    }),
  );
  check(
    "otro modelo no usa el promedio y queda desconocido",
    otherModel.status === "REVIEW" && otherModel.requirements[0]?.reasonCode === "DIFFERENT_MODEL",
  );

  const missingAge = evaluateProgram(
    ruleset({ rules: [rule({ id: "age", operator: "MIN_AGE_MONTHS", threshold: 30, family: null, version: null, variant: null })] }),
    facts({ bureaus: [bureau({ ageMonths: null }), bureau({ bureau: "EQUIFAX", ageMonths: null })] }),
  );
  check(
    "la edad ausente no pasa",
    missingAge.status === "REVIEW" && missingAge.requirements[0]?.result === "UNKNOWN" && missingAge.requirements[0]?.reasonCode === "MISSING_AGE",
  );

  const empty = evaluateProgram(ruleset({ rules: [] }), facts());
  check("cero reglas queda en revisión", empty.status === "REVIEW" && empty.requirements.length === 0);

  const optionalFail = evaluateProgram(
    ruleset({
      rules: [
        rule(),
        rule({
          id: "util",
          required: false,
          operator: "MAX_UTILIZATION",
          threshold: 1000,
          family: null,
          version: null,
          variant: null,
        }),
      ],
    }),
    facts({
      bureaus: [bureau({ balanceCents: 5000n }), bureau({ bureau: "EQUIFAX", balanceCents: 5000n })],
    }),
  );
  check(
    "un opcional en FAIL no tumba el programa",
    optionalFail.status === "PASS" && optionalFail.requirements.find((item) => item.ruleId === "util")?.result === "FAIL",
    optionalFail,
  );

  const oneBureau = evaluateProgram(
    ruleset(),
    facts({ bureaus: [bureau()] }),
  );
  check(
    "un buró que pasa no aprueba al que falta",
    oneBureau.status === "REVIEW" && oneBureau.requirements[0]?.result === "UNKNOWN",
  );

  const partial = evaluateProgram(
    ruleset({
      bureaus: ["EXPERIAN"],
      rules: [rule({ id: "util", operator: "MAX_UTILIZATION", threshold: 3000, family: null, version: null, variant: null })],
    }),
    facts({ bureaus: [bureau({ limitCents: null })] }),
  );
  check("un límite ausente no pasa", partial.status === "REVIEW" && partial.requirements[0]?.reasonCode === "MISSING_UTILIZATION");

  const rounded = evaluateProgram(
    ruleset({
      bureaus: ["EXPERIAN"],
      rules: [rule({ id: "util", operator: "MAX_UTILIZATION", threshold: 3333, family: null, version: null, variant: null })],
    }),
    facts({ bureaus: [bureau({ balanceCents: 1n, limitCents: 3n })] }),
  );
  const exact = evaluateProgram(
    ruleset({
      bureaus: ["EXPERIAN"],
      rules: [rule({ id: "util", operator: "MAX_UTILIZATION", threshold: 3333, family: null, version: null, variant: null })],
    }),
    facts({ bureaus: [bureau({ balanceCents: 3333n, limitCents: 10000n })] }),
  );
  check(
    "el ratio se compara exacto y no con un basis point redondeado",
    rounded.requirements[0]?.result === "FAIL" && exact.requirements[0]?.result === "PASS",
    { rounded: rounded.requirements[0], exact: exact.requirements[0] },
  );

  const kept = acceptRuleset([ruleset()], ruleset({ version: 1 }));
  check("una versión repetida no reemplaza la anterior", kept.accepted === false && kept.rulesets.length === 1);
  const rejected = acceptRuleset([ruleset()], ruleset({ version: 2, rules: [rule({ sql: "delete from CreditReport" })] }));
  check("un SQL no entra", rejected.accepted === false && rejected.reason === "OPERATOR" && rejected.rulesets.length === 1);
  const internal = evaluateProgram(ruleset({ source: "INTERNAL", sourceLabel: "demostración" }), facts());
  check("un programa interno no es una oferta", internal.internalDemo === true && internal.approvedAmount === null);

  const estimate = readFileSync("src/lib/credit/funding-estimate.ts", "utf8");
  const prep = readFileSync("src/lib/credit/funding-prep.ts", "utf8");
  const panel = readFileSync("src/components/clients/agency-client-detail.tsx", "utf8");
  check("el estimador sigue sin monto", estimate.includes('status: "UNAVAILABLE"') && estimate.includes("amount: null"));
  check("el título del panel no cambió", prep.includes('FUNDING_PREP_TITLE = "Requiere programa"'));
  check(
    "el panel dice que no hay programa y no llama elegible al resultado",
    panel.includes("PROGRAM_NOT_VERSIONED") && !panel.includes("Elegible"),
  );

  console.log("\nOK credit-programs\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
