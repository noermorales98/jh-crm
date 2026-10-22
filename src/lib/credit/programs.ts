/**
 * Evaluación de un programa concreto.
 * PASS solo dice que coincidió con las reglas registradas. No hay monto.
 */
import { scoresComparable } from "@/src/lib/credit/contracts";

export const PROGRAM_POLICY_VERSION = "t20-2026-10-21";
export const PROGRAM_MATCH_MEANING = "MATCHES_RECORDED_RULES_ONLY" as const;
export const PROGRAM_NOT_AN_APPROVAL =
  "Coincide con las reglas registradas. No es una aprobación.";
export const PROGRAM_NOT_VERSIONED = "Sin programa versionado. No es una aprobación.";
export const PROGRAM_INTERNAL_NOTE = "Programa interno de demostración. No es una oferta.";
export const PROGRAM_OPERATORS = ["MIN_SCORE", "MIN_AGE_MONTHS", "MAX_UTILIZATION"] as const;

export type ProgramOperator = (typeof PROGRAM_OPERATORS)[number];
export type ProgramSource = "INTERNAL" | "VERIFIED_LENDER";
export type RequirementResult = "PASS" | "FAIL" | "UNKNOWN";
export type ProgramStatus = "PASS" | "FAIL" | "REVIEW";

export type ProgramRule = {
  id: string;
  required: boolean;
  operator: ProgramOperator;
  threshold: number;
  family: string | null;
  version: string | null;
  variant: string | null;
  expression?: string | null;
  sql?: string | null;
};

export type ProgramRuleset = {
  programId: string;
  version: number;
  source: ProgramSource | null;
  sourceLabel: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  organizationId: string;
  clientId: string;
  reviewed: boolean;
  bureaus: readonly string[];
  rules: readonly ProgramRule[];
};

export type BureauFacts = {
  bureau: string;
  score: {
    value: number | null;
    family: string | null;
    version: string | null;
    variant: string | null;
  } | null;
  ageMonths: number | null;
  balanceCents: bigint | null;
  limitCents: bigint | null;
};

export type ProgramFacts = {
  snapshotId: string;
  asOf: string;
  organizationId: string;
  clientId: string;
  bureaus: readonly BureauFacts[];
};

export type EvaluatedRequirement = {
  ruleId: string;
  required: boolean;
  result: RequirementResult;
  reasonCode: string;
};

export type ProgramEvaluation = {
  policyVersion: typeof PROGRAM_POLICY_VERSION;
  programId: string;
  version: number;
  snapshotId: string;
  status: ProgramStatus;
  meaning: typeof PROGRAM_MATCH_MEANING;
  approvedAmount: null;
  internalDemo: boolean;
  requirements: EvaluatedRequirement[];
};

export function evaluateProgram(ruleset: ProgramRuleset, facts: ProgramFacts): ProgramEvaluation {
  const block = applicability(ruleset, facts);
  const requirements = block
    ? ruleset.rules.map((rule) => ({
        ruleId: rule.id,
        required: rule.required,
        result: "UNKNOWN" as const,
        reasonCode: block,
      }))
    : ruleset.rules.map((rule) => evaluateRule(rule, ruleset.bureaus, facts.bureaus));
  return {
    policyVersion: PROGRAM_POLICY_VERSION,
    programId: ruleset.programId,
    version: ruleset.version,
    snapshotId: facts.snapshotId,
    status: block ? "REVIEW" : programStatus(requirements),
    meaning: PROGRAM_MATCH_MEANING,
    approvedAmount: null,
    internalDemo: ruleset.source === "INTERNAL",
    requirements,
  };
}

export function acceptRuleset(
  prior: readonly ProgramRuleset[],
  next: ProgramRuleset,
): { rulesets: readonly ProgramRuleset[]; accepted: boolean; reason: string | null } {
  if (!Number.isInteger(next.version) || next.version < 1) {
    return { rulesets: prior, accepted: false, reason: "VERSION" };
  }
  if (prior.some((ruleset) => ruleset.programId === next.programId && ruleset.version >= next.version)) {
    return { rulesets: prior, accepted: false, reason: "DUPLICATE_VERSION" };
  }
  if (next.rules.some((rule) => !allowedRule(rule))) {
    return { rulesets: prior, accepted: false, reason: "OPERATOR" };
  }
  return { rulesets: [...prior, next], accepted: true, reason: null };
}

function applicability(ruleset: ProgramRuleset, facts: ProgramFacts): string | null {
  if (ruleset.source !== "INTERNAL" && ruleset.source !== "VERIFIED_LENDER") return "NO_SOURCE";
  if (present(ruleset.sourceLabel) == null) return "NO_SOURCE";
  if (!ruleset.reviewed) return "NOT_REVIEWED";
  if (!isoDate(ruleset.effectiveFrom) || !isoDate(ruleset.effectiveUntil) || !isoDate(facts.asOf)) return "NO_TERM";
  if (facts.asOf < ruleset.effectiveFrom! || facts.asOf > ruleset.effectiveUntil!) return "EXPIRED";
  if (facts.organizationId !== ruleset.organizationId || facts.clientId !== ruleset.clientId) return "SCOPE";
  if (ruleset.bureaus.length === 0) return "NO_BUREAU_POLICY";
  if (ruleset.rules.length === 0) return "EMPTY";
  if (ruleset.rules.some((rule) => !allowedRule(rule))) return "OPERATOR";
  return null;
}

function evaluateRule(
  rule: ProgramRule,
  bureaus: readonly string[],
  facts: readonly BureauFacts[],
): EvaluatedRequirement {
  const results = bureaus.map((bureau) => {
    const fact = facts.find((item) => sameText(item.bureau, bureau));
    if (!fact) return { result: "UNKNOWN" as const, reasonCode: "MISSING_BUREAU" };
    return applyOperator(rule, fact);
  });
  const failed = results.find((item) => item.result === "FAIL");
  if (failed) return { ruleId: rule.id, required: rule.required, result: "FAIL", reasonCode: failed.reasonCode };
  const unknown = results.find((item) => item.result === "UNKNOWN");
  if (unknown) return { ruleId: rule.id, required: rule.required, result: "UNKNOWN", reasonCode: unknown.reasonCode };
  return { ruleId: rule.id, required: rule.required, result: "PASS", reasonCode: "OK" };
}

function applyOperator(rule: ProgramRule, fact: BureauFacts): { result: RequirementResult; reasonCode: string } {
  if (!Number.isInteger(rule.threshold) || rule.threshold < 0) return { result: "UNKNOWN", reasonCode: "THRESHOLD" };
  if (rule.operator === "MIN_AGE_MONTHS") {
    if (fact.ageMonths == null || !Number.isInteger(fact.ageMonths) || fact.ageMonths < 0) {
      return { result: "UNKNOWN", reasonCode: "MISSING_AGE" };
    }
    return fact.ageMonths >= rule.threshold
      ? { result: "PASS", reasonCode: "OK" }
      : { result: "FAIL", reasonCode: "AGE_SHORT" };
  }
  if (rule.operator === "MAX_UTILIZATION") {
    const balance = fact.balanceCents;
    const limit = fact.limitCents;
    if (balance == null || limit == null || balance < 0n || limit <= 0n) {
      return { result: "UNKNOWN", reasonCode: "MISSING_UTILIZATION" };
    }
    const within = balance * 10000n <= limit * BigInt(rule.threshold);
    return within ? { result: "PASS", reasonCode: "OK" } : { result: "FAIL", reasonCode: "UTILIZATION_HIGH" };
  }
  const score = fact.score;
  if (score == null || score.value == null || !Number.isInteger(score.value) || score.value <= 0) {
    return { result: "UNKNOWN", reasonCode: "MISSING_SCORE" };
  }
  const identity = scoresComparable(
    { bureau: fact.bureau, family: score.family, version: score.version, variant: score.variant },
    { bureau: fact.bureau, family: rule.family, version: rule.version, variant: rule.variant },
  );
  if (!identity.comparable) return { result: "UNKNOWN", reasonCode: "DIFFERENT_MODEL" };
  return score.value >= rule.threshold
    ? { result: "PASS", reasonCode: "OK" }
    : { result: "FAIL", reasonCode: "BELOW_SCORE" };
}

function programStatus(requirements: readonly EvaluatedRequirement[]): ProgramStatus {
  const required = requirements.filter((item) => item.required);
  if (required.length === 0) return "REVIEW";
  if (required.some((item) => item.result === "FAIL")) return "FAIL";
  if (required.some((item) => item.result === "UNKNOWN")) return "REVIEW";
  return "PASS";
}

function allowedRule(rule: ProgramRule): boolean {
  if (!PROGRAM_OPERATORS.includes(rule.operator)) return false;
  if (present(rule.expression) != null || present(rule.sql) != null) return false;
  return Number.isInteger(rule.threshold) && rule.threshold >= 0;
}

function present(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text.length ? text : null;
}

function sameText(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

function isoDate(value: string | null): boolean {
  return value != null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
