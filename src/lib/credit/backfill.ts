/**
 * Recorrido de identidades y snapshot consolidado.
 * No escribe Prisma. La lectura v2 nace apagada.
 */
import type { CreditorAlias } from "./normalize";
import {
  proposeIdentity,
  type IdentityDecision,
  type IdentityObservation,
} from "./identity";
import { assertCreditAccess, type CreditActor } from "./access";

export const SELECTION_POLICY_VERSION = "t06-selection-2026-10-20";

export type BackfillObservation = IdentityObservation & {
  reportDate: string;
  creditLimitCents: number | null;
  canonicalTradelineId: string | null;
};

export type BackfillCheckpoint = {
  cursor: string | null;
  linkedCount: number;
};

export type BackfillDryRun = {
  observationCount: number;
  proposed: number;
  confirmed: number;
  pending: number;
  conflicts: string[];
};

export type ConsolidatedAccount = {
  canonicalId: string;
  identityVersion: number;
  observationId: string;
  reportId: string;
  balanceCents: number | null;
  creditLimitCents: number | null;
};

export type ConsolidatedSnapshot = {
  organizationId: string;
  clientId: string;
  creditCaseId: string;
  confirmedReportIds: string[];
  asOf: string;
  identityVersion: number;
  selectionPolicyVersion: string;
  accounts: ConsolidatedAccount[];
  coverage: "COMPLETE" | "INCOMPLETE";
  warnings: string[];
  sourceObservationIds: string[];
};

/** Allowlist vacía: ninguna organización lee la vista nueva. */
export function isCreditIdentityReadEnabled(
  organizationId: string,
  enabledOrganizationIds: readonly string[] = [],
): boolean {
  return enabledOrganizationIds.includes(organizationId);
}

function assertScope(
  actor: CreditActor,
  clientId: string,
  observations: BackfillObservation[],
  mode: "view" | "manage",
): void {
  assertCreditAccess({
    actor,
    clientId,
    resource: { organizationId: actor.organizationId, clientId },
    mode,
  });
  for (const item of observations) {
    assertCreditAccess({
      actor,
      clientId,
      resource: { organizationId: item.organizationId, clientId: item.clientId },
      mode,
    });
  }
}

function confirmedIds(decisions: readonly IdentityDecision[]): Map<string, IdentityDecision> {
  const map = new Map<string, IdentityDecision>();
  for (const decision of decisions) {
    if (decision.status !== "CONFIRMED" || decision.canonicalId == null) continue;
    for (const id of decision.observationIds) map.set(id, decision);
  }
  return map;
}

export function dryRunBackfill(input: {
  actor: CreditActor;
  clientId: string;
  observations: readonly BackfillObservation[];
  confirmed: readonly IdentityDecision[];
  aliases?: readonly CreditorAlias[];
}): BackfillDryRun {
  const observations = [...input.observations];
  assertScope(input.actor, input.clientId, observations, "view");
  const proposal = proposeIdentity(observations, input.aliases ?? []);
  const linked = confirmedIds(input.confirmed);
  const pending = observations.filter((item) => !linked.has(item.id)).length;
  return {
    observationCount: observations.length,
    proposed: proposal.groups.length,
    confirmed: input.confirmed.filter((item) => item.status === "CONFIRMED").length,
    pending,
    conflicts: proposal.conflicts,
  };
}

function pageAfter(
  observations: readonly BackfillObservation[],
  cursor: string | null,
  pageSize: number,
): BackfillObservation[] {
  return [...observations]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .filter((item) => cursor == null || item.id > cursor)
    .slice(0, pageSize);
}

export function applyBackfillPage(input: {
  actor: CreditActor;
  clientId: string;
  observations: readonly BackfillObservation[];
  confirmed: readonly IdentityDecision[];
  checkpoint: BackfillCheckpoint;
  pageSize: number;
  workerId: string;
  claims: Map<string, string>;
}): {
  checkpoint: BackfillCheckpoint;
  links: Array<{ observationId: string; canonicalId: string }>;
  claimed: boolean;
  advanced: boolean;
} {
  assertScope(input.actor, input.clientId, [...input.observations], "manage");
  const page = pageAfter(input.observations, input.checkpoint.cursor, input.pageSize);
  if (page.length === 0) {
    return { checkpoint: input.checkpoint, links: [], claimed: true, advanced: false };
  }
  const pageKey = `${input.checkpoint.cursor ?? ""}|${page.map((item) => item.id).join(",")}`;
  const owner = input.claims.get(pageKey);
  if (owner != null && owner !== input.workerId) {
    return { checkpoint: input.checkpoint, links: [], claimed: false, advanced: false };
  }
  input.claims.set(pageKey, input.workerId);
  const decided = confirmedIds(input.confirmed);
  const links: Array<{ observationId: string; canonicalId: string }> = [];
  for (const item of page) {
    const decision = decided.get(item.id);
    if (decision?.canonicalId == null) continue;
    if (item.canonicalTradelineId != null) continue;
    links.push({ observationId: item.id, canonicalId: decision.canonicalId });
  }
  return {
    checkpoint: {
      cursor: page[page.length - 1]!.id,
      linkedCount: input.checkpoint.linkedCount + links.length,
    },
    links,
    claimed: true,
    advanced: true,
  };
}

function selectObservation(
  items: readonly BackfillObservation[],
  asOf: string,
): BackfillObservation | null {
  const eligible = items.filter((item) => item.reportDate <= asOf);
  if (eligible.length === 0) return null;
  return eligible.sort((left, right) => {
    if (left.reportDate !== right.reportDate) return left.reportDate < right.reportDate ? 1 : -1;
    return left.id < right.id ? 1 : -1;
  })[0]!;
}

export function buildConsolidatedSnapshot(input: {
  actor: CreditActor;
  clientId: string;
  creditCaseId: string;
  observations: readonly BackfillObservation[];
  confirmed: readonly IdentityDecision[];
  confirmedReportIds: readonly string[];
  asOf: string;
}): ConsolidatedSnapshot {
  const observations = [...input.observations];
  assertScope(input.actor, input.clientId, observations, "view");
  const reports = new Set(input.confirmedReportIds);
  const warnings: string[] = [];
  const accounts: ConsolidatedAccount[] = [];
  const sourceObservationIds: string[] = [];
  let incomplete = false;
  let identityVersion = 0;

  for (const decision of input.confirmed) {
    if (decision.status !== "CONFIRMED" || decision.canonicalId == null) continue;
    identityVersion = Math.max(identityVersion, decision.identityVersion);
    const owned = observations.filter((item) => decision.observationIds.includes(item.id));
    const outside = owned.filter((item) => !reports.has(item.reportId));
    if (outside.length > 0) warnings.push("OUTSIDE_CONFIRMED_REPORTS");
    const selected = selectObservation(
      owned.filter((item) => reports.has(item.reportId)),
      input.asOf,
    );
    if (selected == null) {
      incomplete = true;
      warnings.push("NO_OBSERVATION_AS_OF");
      continue;
    }
    sourceObservationIds.push(selected.id);
    accounts.push({
      canonicalId: decision.canonicalId,
      identityVersion: decision.identityVersion,
      observationId: selected.id,
      reportId: selected.reportId,
      balanceCents: selected.balanceCents ?? null,
      creditLimitCents: selected.creditLimitCents,
    });
  }

  return {
    organizationId: input.actor.organizationId,
    clientId: input.clientId,
    creditCaseId: input.creditCaseId,
    confirmedReportIds: [...input.confirmedReportIds],
    asOf: input.asOf,
    identityVersion,
    selectionPolicyVersion: SELECTION_POLICY_VERSION,
    accounts,
    coverage: incomplete ? "INCOMPLETE" : "COMPLETE",
    warnings,
    sourceObservationIds,
  };
}
