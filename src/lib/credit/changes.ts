/**
 * Cambio observado entre dos reportes.
 * Una ausencia no es una eliminación lograda y un outcome formal no es la causa.
 */
import { scoreDelta, type ScoreComparison, type ScoreObservation } from "@/src/lib/credit/contracts";

export const CHANGE_POLICY_VERSION = "t18-2026-10-21";
export const ABSENCE_NOT_DELETION =
  "No es una eliminación lograda ni un resultado de la ronda.";
export const COVERAGE_NOT_CERTIFIED = "Sin cobertura guardada no se certifica.";
export const OBSERVED_DIFFERENCE = "Diferencia observada.";
export const PROGRESS_OUTCOME_NOTE =
  "El conteo es el resultado registrado. No se infiere del reporte ni se atribuye a J&H.";

export type ReportCoverage = "COMPLETE" | "PARTIAL" | "UNKNOWN";

export type ChangeKind =
  | "UNCHANGED"
  | "UPDATED"
  | "NEW"
  | "NOT_PRESENT"
  | "INSUFFICIENT_COVERAGE";

export type ChangeObservation = {
  id: string;
  bureau: string;
  canonicalId: string | null;
  identityConfirmed: boolean;
  balanceCents: number | null;
  formalDisposition: string | null;
  responseDocumentId: string | null;
};

export type ChangeReport = {
  reportId: string;
  revision: number;
  coverage: ReportCoverage;
  observations: readonly ChangeObservation[];
  scores: readonly ScoreObservation[];
};

export type AccountChange = {
  kind: ChangeKind;
  bureau: string;
  canonicalId: string | null;
  previousObservationId: string | null;
  currentObservationId: string | null;
  balanceDeltaCents: number | null;
  formalDisposition: string | null;
  responseDocumentId: string | null;
  causalClaim: null;
};

export type ScoreChange = {
  bureau: string;
  delta: number | null;
  comparable: boolean;
  reason: ScoreComparison["reason"];
};

export type ChangeReading = {
  policyVersion: typeof CHANGE_POLICY_VERSION;
  baseReportId: string;
  compareReportId: string;
  baseRevision: number;
  compareRevision: number;
  changes: AccountChange[];
  scores: ScoreChange[];
};

export function compareReports(base: ChangeReport, compare: ChangeReport): ChangeReading {
  return {
    policyVersion: CHANGE_POLICY_VERSION,
    baseReportId: base.reportId,
    compareReportId: compare.reportId,
    baseRevision: base.revision,
    compareRevision: compare.revision,
    changes: accountChanges(base, compare),
    scores: scoreChanges(base.scores, compare.scores),
  };
}

function accountChanges(base: ChangeReport, compare: ChangeReport): AccountChange[] {
  const changes: AccountChange[] = [];
  const baseGroups = groupConfirmed(base.observations);
  const compareGroups = groupConfirmed(compare.observations);
  const keys = [...new Set([...baseGroups.keys(), ...compareGroups.keys()])].sort();

  for (const key of keys) {
    const previous = baseGroups.get(key) ?? [];
    const current = compareGroups.get(key) ?? [];
    if (previous.length > 1 || current.length > 1) {
      for (const item of previous) changes.push(unresolved(item, "previous"));
      for (const item of current) changes.push(unresolved(item, "current"));
      continue;
    }
    const left = previous[0];
    const right = current[0];
    if (left && right) {
      changes.push(paired(left, right));
      continue;
    }
    if (left) {
      changes.push(absent(left, base.coverage, compare.coverage));
      continue;
    }
    if (right) changes.push(added(right));
  }

  for (const item of base.observations) {
    if (confirmedKey(item) == null) changes.push(unresolved(item, "previous"));
  }
  for (const item of compare.observations) {
    if (confirmedKey(item) == null) changes.push(unresolved(item, "current"));
  }

  return changes.sort(byChange);
}

function paired(base: ChangeObservation, compare: ChangeObservation): AccountChange {
  const left = knownCents(base.balanceCents);
  const right = knownCents(compare.balanceCents);
  const delta = left != null && right != null ? right - left : null;
  const kind: ChangeKind =
    left != null && right != null ? (delta === 0 ? "UNCHANGED" : "UPDATED") : left == null && right == null ? "UNCHANGED" : "UPDATED";
  return {
    kind,
    bureau: compare.bureau,
    canonicalId: present(compare.canonicalId),
    previousObservationId: base.id,
    currentObservationId: compare.id,
    balanceDeltaCents: delta,
    formalDisposition: present(compare.formalDisposition) ?? present(base.formalDisposition),
    responseDocumentId: present(compare.responseDocumentId) ?? present(base.responseDocumentId),
    causalClaim: null,
  };
}

function absent(
  base: ChangeObservation,
  baseCoverage: ReportCoverage,
  compareCoverage: ReportCoverage,
): AccountChange {
  return {
    kind: baseCoverage === "COMPLETE" && compareCoverage === "COMPLETE" ? "NOT_PRESENT" : "INSUFFICIENT_COVERAGE",
    bureau: base.bureau,
    canonicalId: present(base.canonicalId),
    previousObservationId: base.id,
    currentObservationId: null,
    balanceDeltaCents: null,
    formalDisposition: present(base.formalDisposition),
    responseDocumentId: present(base.responseDocumentId),
    causalClaim: null,
  };
}

function added(compare: ChangeObservation): AccountChange {
  return {
    kind: "NEW",
    bureau: compare.bureau,
    canonicalId: present(compare.canonicalId),
    previousObservationId: null,
    currentObservationId: compare.id,
    balanceDeltaCents: null,
    formalDisposition: present(compare.formalDisposition),
    responseDocumentId: present(compare.responseDocumentId),
    causalClaim: null,
  };
}

function unresolved(item: ChangeObservation, side?: "previous" | "current"): AccountChange {
  return {
    kind: "INSUFFICIENT_COVERAGE",
    bureau: item.bureau,
    canonicalId: present(item.canonicalId),
    previousObservationId: side === "current" ? null : item.id,
    currentObservationId: side === "previous" ? null : item.id,
    balanceDeltaCents: null,
    formalDisposition: present(item.formalDisposition),
    responseDocumentId: present(item.responseDocumentId),
    causalClaim: null,
  };
}

function scoreChanges(
  baseScores: readonly ScoreObservation[],
  compareScores: readonly ScoreObservation[],
): ScoreChange[] {
  const bureaus = [...new Set([...baseScores, ...compareScores].map((row) => present(row.bureau)).filter((bureau): bureau is string => bureau != null))].sort();
  return bureaus.map((bureau) => {
    const left = baseScores.filter((row) => sameText(row.bureau, bureau));
    const right = compareScores.filter((row) => sameText(row.bureau, bureau));
    if (left.length !== 1 || right.length !== 1) {
      return { bureau, delta: null, comparable: false, reason: "MISSING_MODEL" as const };
    }
    const compared = scoreDelta(left[0]!, right[0]!);
    return { bureau, delta: compared.delta, comparable: compared.comparable, reason: compared.reason };
  });
}

function groupConfirmed(items: readonly ChangeObservation[]): Map<string, ChangeObservation[]> {
  const groups = new Map<string, ChangeObservation[]>();
  for (const item of items) {
    const key = confirmedKey(item);
    if (key == null) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function confirmedKey(item: ChangeObservation): string | null {
  if (!item.identityConfirmed) return null;
  const canonicalId = present(item.canonicalId);
  const bureau = present(item.bureau);
  if (canonicalId == null || bureau == null) return null;
  return `${bureau.toUpperCase()}|${canonicalId}`;
}

function knownCents(value: number | null): number | null {
  return value != null && Number.isInteger(value) ? value : null;
}

function present(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text.length ? text : null;
}

function sameText(left: string | null, right: string): boolean {
  return present(left)?.toUpperCase() === right.toUpperCase();
}

function byChange(left: AccountChange, right: AccountChange): number {
  return [left.bureau, left.canonicalId ?? "", left.previousObservationId ?? "", left.currentObservationId ?? ""].join("\u0000")
    .localeCompare([right.bureau, right.canonicalId ?? "", right.previousObservationId ?? "", right.currentObservationId ?? ""].join("\u0000"));
}
