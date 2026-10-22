/**
 * Usuarios autorizados como vista aparte.
 * No recomienda cantidades ni reescribe la responsabilidad guardada.
 */

import { classifyOwnership } from "./normalize";
import {
  buildRevolvingReading,
  type RevolvingAggregate,
  type RevolvingObservation,
} from "./revolving";
import { ageMonths, type CivilDate } from "./temporal";

export const OWNERSHIP_VERSION = "t12-2026-10-21";
export const AU_LIMIT_NOT_CAPACITY =
  "El límite del usuario autorizado no es capacidad personal.";

export type OwnershipClass = "INDIVIDUAL" | "JOINT" | "AUTHORIZED_USER" | "UNRESOLVED";

export type OwnershipObservation = RevolvingObservation & {
  /** La inferencia del texto no basta. Hace falta una confirmación explícita. */
  ownershipConfirmed: boolean;
  opened: CivilDate | null;
  reportedNegative: boolean;
};

export type AuAccount = {
  canonicalId: string;
  creditorName: string;
  bureaus: string[];
  ageMonths: number | null;
  balanceCents: number | null;
  limitCents: number | null;
  utilizationBps: number | null;
  accountStatus: string | null;
  reportedNegative: boolean;
  sourceReportDate: string;
};

export type OwnershipConflict = {
  canonicalId: string;
  responsibilities: string[];
  observationIds: string[];
};

export type OwnershipSummary = {
  version: string;
  primaryCanonicalIds: string[];
  jointCanonicalIds: string[];
  auCanonicalIds: string[];
  unresolvedCanonicalIds: string[];
  conflicts: OwnershipConflict[];
  auAccounts: AuAccount[];
  primary: RevolvingAggregate;
  joint: RevolvingAggregate;
  withAuthorizedUsers: RevolvingAggregate;
};

function confirmedIdentity(item: OwnershipObservation): boolean {
  return item.identityStatus === "CONFIRMED" && item.canonicalId != null && item.canonicalId.trim() !== "";
}

function ownershipClass(item: OwnershipObservation): OwnershipClass {
  if (!item.ownershipConfirmed) return "UNRESOLVED";
  const classified = classifyOwnership(item.responsibility, "ownership");
  if (classified.ownership.quality === "CONFLICT" || classified.ownership.quality === "MISSING") {
    return "UNRESOLVED";
  }
  if (classified.ownership.value === "INDIVIDUAL" && classified.ownership.quality === "KNOWN") {
    return "INDIVIDUAL";
  }
  if (classified.ownership.value === "JOINT" && classified.ownership.quality === "KNOWN") {
    return "JOINT";
  }
  if (classified.ownership.value === "AUTHORIZED_USER") return "AUTHORIZED_USER";
  return "UNRESOLVED";
}

function latest(items: readonly OwnershipObservation[]): OwnershipObservation {
  return [...items].sort((left, right) => {
    if (left.reportDate !== right.reportDate) return left.reportDate < right.reportDate ? 1 : -1;
    return left.id < right.id ? 1 : -1;
  })[0]!;
}

function asIndividual(item: OwnershipObservation): RevolvingObservation {
  return { ...item, responsibility: "individual" };
}

function aggregateOf(items: readonly OwnershipObservation[], asOf: string): RevolvingAggregate {
  if (items.length === 0) {
    return buildRevolvingReading({ asOf, observations: [] }).consolidated.individual;
  }
  return buildRevolvingReading({
    asOf,
    observations: items.map(asIndividual),
  }).consolidated.individual;
}

export function buildOwnershipSummary(input: {
  asOf: string;
  observations: readonly OwnershipObservation[];
}): OwnershipSummary {
  const groups = new Map<string, OwnershipObservation[]>();
  for (const item of input.observations) {
    const key = confirmedIdentity(item) ? item.canonicalId! : `obs:${item.id}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const primary: OwnershipObservation[] = [];
  const joint: OwnershipObservation[] = [];
  const authorized: OwnershipObservation[] = [];
  const primaryIds: string[] = [];
  const jointIds: string[] = [];
  const auIds: string[] = [];
  const unresolvedIds: string[] = [];
  const conflicts: OwnershipConflict[] = [];
  const auAccounts: AuAccount[] = [];

  for (const [key, items] of groups) {
    const classes = new Set(items.map(ownershipClass));
    const confirmed = items.every(confirmedIdentity);
    if (!confirmed || classes.has("UNRESOLVED")) {
      unresolvedIds.push(key.startsWith("obs:") ? key.slice(4) : key);
      continue;
    }
    if (classes.size !== 1) continue;
    const kind = [...classes][0]!;
    if (kind === "INDIVIDUAL") {
      primaryIds.push(key);
      primary.push(...items);
      continue;
    }
    if (kind === "JOINT") {
      jointIds.push(key);
      joint.push(...items);
      continue;
    }
    const chosen = latest(items);
    const scoped = buildRevolvingReading({
      asOf: input.asOf,
      observations: items.map(asIndividual),
    }).consolidated.cards[0];
    auIds.push(key);
    authorized.push(...items);
    auAccounts.push({
      canonicalId: key,
      creditorName: chosen.creditorName,
      bureaus: [...new Set(items.map((item) => item.bureau))],
      ageMonths: ageMonths(chosen.opened, input.asOf),
      balanceCents: scoped?.balanceCents ?? chosen.balanceCents,
      limitCents: scoped?.limitCents ?? chosen.limitCents,
      utilizationBps: scoped?.utilizationBps ?? null,
      accountStatus: chosen.accountStatus,
      reportedNegative: items.some((item) => item.reportedNegative),
      sourceReportDate: chosen.reportDate,
    });
  }

  for (const [key, items] of groups) {
    if (!items.every(confirmedIdentity)) continue;
    const confirmedItems = items.filter((item) => item.ownershipConfirmed);
    const kinds = new Set(confirmedItems.map(ownershipClass).filter((kind) => kind !== "UNRESOLVED"));
    if (kinds.size > 1) {
      conflicts.push({
        canonicalId: key,
        responsibilities: [...new Set(confirmedItems.map((item) => item.responsibility ?? ""))],
        observationIds: confirmedItems.map((item) => item.id),
      });
    }
  }

  const conflictIds = new Set(conflicts.map((item) => item.canonicalId));
  const withoutConflicts = (ids: string[], rows: OwnershipObservation[]) => ({
    ids: ids.filter((id) => !conflictIds.has(id)),
    rows: rows.filter((item) => !conflictIds.has(item.canonicalId ?? "")),
  });
  const primaryKept = withoutConflicts(primaryIds, primary);
  const jointKept = withoutConflicts(jointIds, joint);
  const auKeptIds = auIds.filter((id) => !conflictIds.has(id));
  const auKeptRows = authorized.filter((item) => !conflictIds.has(item.canonicalId ?? ""));

  return {
    version: OWNERSHIP_VERSION,
    primaryCanonicalIds: primaryKept.ids,
    jointCanonicalIds: jointKept.ids,
    auCanonicalIds: auKeptIds,
    unresolvedCanonicalIds: unresolvedIds,
    conflicts,
    auAccounts: auAccounts.filter((account) => !conflictIds.has(account.canonicalId)),
    primary: aggregateOf(primaryKept.rows, input.asOf),
    joint: aggregateOf(jointKept.rows, input.asOf),
    withAuthorizedUsers: aggregateOf([...primaryKept.rows, ...auKeptRows], input.asOf),
  };
}
