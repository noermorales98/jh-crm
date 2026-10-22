/**
 * Identidad entre burós. No escribe Prisma ni AuditLog.
 * Un candidato no queda confirmado solo.
 */
import type { CreditorAlias } from "./normalize";
import { normalizeCreditorName } from "./normalize";
import { assertCreditAccess, type CreditActor } from "./access";

export const IDENTITY_ENGINE_VERSION = "t05-2026-10-20";

export type IdentityObservation = {
  id: string;
  organizationId: string;
  clientId: string;
  reportId: string;
  bureau: string;
  creditorName: string | null;
  suffix: string | null;
  /** YYYY-MM. El día no entra en la identidad. */
  openedMonth: string | null;
  /** null o UNKNOWN no contradicen otra familia. */
  family: string | null;
  balanceCents?: number | null;
};

export type PairOutcome =
  | "SAME_OBSERVATION"
  | "EXTRACTION_DUPLICATE"
  | "REJECT"
  | "REVIEW"
  | "REVIEW_CANDIDATE"
  | "UNLINKED";

export type PairComparison = {
  outcome: PairOutcome;
  reasons: string[];
  signals: string[];
};

export type IdentityDecision = {
  observationIds: string[];
  canonicalId: string | null;
  status: "UNLINKED" | "PROPOSED" | "CONFIRMED";
  signals: string[];
  conflicts: string[];
  reviewedBy: string | null;
  identityVersion: number;
};

export type IdentityAuditEvent = {
  action: "IDENTITY_MERGE" | "IDENTITY_SPLIT";
  organizationId: string;
  entityType: "CanonicalTradeline";
  entityId: string;
  identityVersion: number;
  observationIds: string[];
  actorUserId: string | null;
};

export type IdentityProposal = {
  version: string;
  groups: IdentityDecision[];
  conflicts: string[];
};

function knownFamily(value: string | null): string | null {
  if (value == null) return null;
  const text = value.trim();
  if (!text || text.toUpperCase() === "UNKNOWN") return null;
  return text.toUpperCase();
}

function text(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function creditorOf(observation: IdentityObservation, aliases: readonly CreditorAlias[]): string | null {
  return normalizeCreditorName(observation.creditorName, aliases);
}

/** Misma fila repetida por solape. No es una cuenta entre burós. */
export function isExtractionDuplicate(
  left: IdentityObservation,
  right: IdentityObservation,
  aliases: readonly CreditorAlias[] = [],
): boolean {
  if (left.id === right.id) return false;
  if (left.reportId !== right.reportId || left.bureau !== right.bureau) return false;
  const creditor = creditorOf(left, aliases);
  return (
    creditor != null &&
    creditor === creditorOf(right, aliases) &&
    text(left.suffix) === text(right.suffix) &&
    text(left.openedMonth) === text(right.openedMonth)
  );
}

export function compareObservations(
  left: IdentityObservation,
  right: IdentityObservation,
  aliases: readonly CreditorAlias[] = [],
): PairComparison {
  if (left.organizationId !== right.organizationId || left.clientId !== right.clientId) {
    return { outcome: "REJECT", reasons: ["SCOPE_MISMATCH"], signals: [] };
  }
  if (left.id === right.id) {
    return { outcome: "SAME_OBSERVATION", reasons: [], signals: [] };
  }
  if (isExtractionDuplicate(left, right, aliases)) {
    return { outcome: "EXTRACTION_DUPLICATE", reasons: ["EXTRACTION_DUPLICATE"], signals: [] };
  }

  const leftFamily = knownFamily(left.family);
  const rightFamily = knownFamily(right.family);
  if (leftFamily && rightFamily && leftFamily !== rightFamily) {
    return { outcome: "REJECT", reasons: ["INCOMPATIBLE_FAMILY"], signals: [] };
  }

  const reasons: string[] = [];
  const leftSuffix = text(left.suffix);
  const rightSuffix = text(right.suffix);
  if (leftSuffix && rightSuffix && leftSuffix !== rightSuffix) reasons.push("SUFFIX_CONFLICT");
  const leftOpened = text(left.openedMonth);
  const rightOpened = text(right.openedMonth);
  if (leftOpened && rightOpened && leftOpened !== rightOpened) reasons.push("OPENED_CONFLICT");
  if (reasons.length > 0) return { outcome: "REVIEW", reasons, signals: [] };

  const leftCreditor = creditorOf(left, aliases);
  const rightCreditor = creditorOf(right, aliases);
  if (leftCreditor == null || rightCreditor == null || leftCreditor !== rightCreditor) {
    return { outcome: "UNLINKED", reasons: [], signals: [] };
  }

  const signals = ["CREDITOR"];
  if (leftSuffix && leftSuffix === rightSuffix) signals.push("SUFFIX");
  if (leftOpened && leftOpened === rightOpened) signals.push("OPENED_MONTH");
  if (leftFamily && leftFamily === rightFamily) signals.push("FAMILY");
  return { outcome: "REVIEW_CANDIDATE", reasons: [], signals };
}

function componentPairsDisagree(
  ids: string[],
  observations: IdentityObservation[],
  aliases: readonly CreditorAlias[],
): boolean {
  const byId = new Map(observations.map((item) => [item.id, item]));
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const pair = compareObservations(byId.get(ids[i]!)!, byId.get(ids[j]!)!, aliases);
      if (pair.outcome === "REJECT" || pair.outcome === "REVIEW") return true;
    }
  }
  return false;
}

export function proposeIdentity(
  observations: IdentityObservation[],
  aliases: readonly CreditorAlias[] = [],
): IdentityProposal {
  const parent = new Map(observations.map((item) => [item.id, item.id]));
  const find = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const unite = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  };

  for (let i = 0; i < observations.length; i += 1) {
    for (let j = i + 1; j < observations.length; j += 1) {
      const pair = compareObservations(observations[i]!, observations[j]!, aliases);
      if (pair.outcome === "REVIEW_CANDIDATE") unite(observations[i]!.id, observations[j]!.id);
    }
  }

  const buckets = new Map<string, string[]>();
  for (const item of observations) {
    const root = find(item.id);
    const list = buckets.get(root) ?? [];
    list.push(item.id);
    buckets.set(root, list);
  }

  const groups: IdentityDecision[] = [];
  const conflicts: string[] = [];
  for (const ids of buckets.values()) {
    if (ids.length < 2) continue;
    if (componentPairsDisagree(ids, observations, aliases)) {
      conflicts.push("TRANSITIVE_CONFLICT");
      continue;
    }
    const signals = new Set<string>();
    const byId = new Map(observations.map((item) => [item.id, item]));
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const pair = compareObservations(byId.get(ids[i]!)!, byId.get(ids[j]!)!, aliases);
        for (const signal of pair.signals) signals.add(signal);
      }
    }
    groups.push({
      observationIds: [...ids].sort(),
      canonicalId: null,
      status: "PROPOSED",
      signals: [...signals].sort(),
      conflicts: [],
      reviewedBy: null,
      identityVersion: 0,
    });
  }

  return { version: IDENTITY_ENGINE_VERSION, groups, conflicts };
}

function requireSameScope(observations: IdentityObservation[]): { organizationId: string; clientId: string } {
  const first = observations[0];
  if (!first) throw new Error("SCOPE_MISMATCH");
  for (const item of observations) {
    if (item.organizationId !== first.organizationId || item.clientId !== first.clientId) {
      throw new Error("SCOPE_MISMATCH");
    }
  }
  return { organizationId: first.organizationId, clientId: first.clientId };
}

function canonicalIdFor(ids: string[], version: number): string {
  return `can-${[...ids].sort().join("_")}-v${version}`;
}

export function confirmIdentity(input: {
  actor: CreditActor;
  clientId: string;
  observations: IdentityObservation[];
  aliases?: readonly CreditorAlias[];
  review: "CONFIRMED";
  reviewedBy: string;
}): { identity: IdentityDecision; audit: IdentityAuditEvent } {
  if (input.review !== "CONFIRMED") throw new Error("REVIEW_REQUIRED");
  const scope = requireSameScope(input.observations);
  assertCreditAccess({
    actor: input.actor,
    clientId: input.clientId,
    resource: scope,
    mode: "manage",
  });
  const proposal = proposeIdentity(input.observations, input.aliases ?? []);
  const ids = input.observations.map((item) => item.id).sort();
  const group = proposal.groups.find(
    (item) => item.observationIds.length === ids.length && item.observationIds.every((id, index) => id === ids[index]),
  );
  if (!group || group.status !== "PROPOSED") throw new Error("REVIEW_REQUIRED");
  const identityVersion = 1;
  const canonicalId = canonicalIdFor(ids, identityVersion);
  return {
    identity: {
      ...group,
      canonicalId,
      status: "CONFIRMED",
      reviewedBy: input.reviewedBy,
      identityVersion,
    },
    audit: {
      action: "IDENTITY_MERGE",
      organizationId: scope.organizationId,
      entityType: "CanonicalTradeline",
      entityId: canonicalId,
      identityVersion,
      observationIds: ids,
      actorUserId: input.reviewedBy,
    },
  };
}

export function splitIdentity(input: {
  actor: CreditActor;
  clientId: string;
  identity: IdentityDecision;
  observations: IdentityObservation[];
  detachIds: string[];
  reviewedBy: string;
}): { kept: IdentityDecision; detached: IdentityDecision; audit: IdentityAuditEvent } {
  if (input.identity.status !== "CONFIRMED" || input.identity.canonicalId == null) {
    throw new Error("REVIEW_REQUIRED");
  }
  const scope = requireSameScope(input.observations);
  assertCreditAccess({
    actor: input.actor,
    clientId: input.clientId,
    resource: scope,
    mode: "manage",
  });
  const detach = new Set(input.detachIds);
  const known = new Set(input.identity.observationIds);
  if (detach.size === 0 || [...detach].some((id) => !known.has(id)) || detach.size === known.size) {
    throw new Error("REVIEW_REQUIRED");
  }
  const keptIds = input.identity.observationIds.filter((id) => !detach.has(id));
  const detachedIds = input.identity.observationIds.filter((id) => detach.has(id));
  const identityVersion = input.identity.identityVersion + 1;
  const kept: IdentityDecision = {
    observationIds: keptIds,
    canonicalId: canonicalIdFor(keptIds, identityVersion),
    status: "CONFIRMED",
    signals: input.identity.signals,
    conflicts: [],
    reviewedBy: input.reviewedBy,
    identityVersion,
  };
  const detached: IdentityDecision = {
    observationIds: detachedIds,
    canonicalId: canonicalIdFor(detachedIds, identityVersion),
    status: "CONFIRMED",
    signals: input.identity.signals,
    conflicts: [],
    reviewedBy: input.reviewedBy,
    identityVersion,
  };
  return {
    kept,
    detached,
    audit: {
      action: "IDENTITY_SPLIT",
      organizationId: scope.organizationId,
      entityType: "CanonicalTradeline",
      entityId: input.identity.canonicalId,
      identityVersion,
      observationIds: [...keptIds, ...detachedIds],
      actorUserId: input.reviewedBy,
    },
  };
}
