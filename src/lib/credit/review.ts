/**
 * Revisión de una importación. No escribe Prisma.
 * El borrador no publica. La confirmación no pisa un snapshot ya cerrado.
 */
import { assertCreditAccess, type CreditActor } from "./access";
import {
  buildConsolidatedSnapshot,
  type BackfillObservation,
  type ConsolidatedSnapshot,
} from "./backfill";
import type { IdentityDecision } from "./identity";

export const REVIEW_VERSION = "t08-2026-10-20";

export type ReviewField = {
  id: string;
  label: string;
  quality: string | null;
  sourcePage: number | null;
  critical: boolean;
  unknown: boolean;
};

export type ImportReview = {
  version: string;
  revision: number;
  status: "DRAFT" | "CONFIRMED";
  idempotencyKey: string | null;
  reportId: string | null;
  confirmedSnapshot: ConsolidatedSnapshot | null;
  reviewedFieldIds: string[];
  authorUserId: string | null;
  reason: string | null;
  disputeAuthorized: false;
  inaccuracyConfirmed: false;
};

export type CertifiedScore = {
  bureau: string;
  score: number;
  modelFamily: string;
  modelVersion: string | null;
};

export type ConfirmResult = {
  outcome: "PUBLISHED" | "REPLAY";
  review: ImportReview;
  certifiedScores: CertifiedScore[];
  audit: {
    action: "IMPORT_CONFIRMED";
    authorUserId: string;
    reason: string;
    revision: number;
    idempotencyKey: string;
  };
  disputeAuthorized: false;
  inaccuracyConfirmed: false;
};

type Scope = { organizationId: string; clientId: string };

type ScoreInput = {
  bureau: string;
  score?: number | null;
  modelFamily?: string | null;
  modelVersion?: string | null;
};

type ItemInput = {
  creditorName: string;
  sourcePage?: number | null;
  fieldQuality?: { family?: string | null; familyQuality?: string | null } | null;
};

export function emptyReview(): ImportReview {
  return {
    version: REVIEW_VERSION,
    revision: 0,
    status: "DRAFT",
    idempotencyKey: null,
    reportId: null,
    confirmedSnapshot: null,
    reviewedFieldIds: [],
    authorUserId: null,
    reason: null,
    disputeAuthorized: false,
    inaccuracyConfirmed: false,
  };
}

export function identityDecisionId(decision: IdentityDecision): string {
  return decision.canonicalId ?? [...decision.observationIds].sort().join("_");
}

export function reviewFields(input: {
  reportDate?: string | null;
  snapshots?: readonly ScoreInput[];
  items?: readonly ItemInput[];
  identities?: readonly IdentityDecision[];
}): ReviewField[] {
  const fields: ReviewField[] = [
    {
      id: "report.reportDate",
      label: "Fecha del reporte",
      quality: input.reportDate ? "KNOWN" : "MISSING",
      sourcePage: null,
      critical: true,
      unknown: !input.reportDate,
    },
  ];
  for (const snapshot of input.snapshots ?? []) {
    const model = snapshot.modelFamily?.trim() || null;
    fields.push({
      id: `score.${snapshot.bureau}`,
      label: snapshot.bureau,
      quality: model ? "KNOWN" : "MISSING",
      sourcePage: null,
      critical: true,
      unknown: model == null,
    });
  }
  for (const [index, item] of (input.items ?? []).entries()) {
    const family = item.fieldQuality?.family ?? null;
    const quality = item.fieldQuality?.familyQuality ?? null;
    fields.push({
      id: `item.${index}`,
      label: item.creditorName,
      quality,
      sourcePage: item.sourcePage ?? null,
      critical: false,
      unknown: quality == null || quality === "MISSING" || family === "UNKNOWN",
    });
  }
  for (const decision of input.identities ?? []) {
    if (decision.status !== "PROPOSED") continue;
    fields.push({
      id: `identity.${identityDecisionId(decision)}`,
      label: "Identidad propuesta",
      quality: "PROPOSED",
      sourcePage: null,
      critical: true,
      unknown: true,
    });
  }
  return fields;
}

export function summarizeReview(fields: readonly ReviewField[], reviewedFieldIds: readonly string[]) {
  const reviewed = new Set(reviewedFieldIds);
  const criticalPending = fields.filter((field) => field.critical && !reviewed.has(field.id));
  return {
    total: fields.length,
    reviewed: fields.filter((field) => reviewed.has(field.id)).length,
    unknown: fields.filter((field) => field.unknown).length,
    criticalPending: criticalPending.map((field) => field.id),
  };
}

function requireManage(actor: CreditActor, clientId: string, resource: Scope) {
  assertCreditAccess({ actor, clientId, resource, mode: "manage" });
}

export function saveDraft(input: {
  actor: CreditActor;
  clientId: string;
  resource: Scope;
  review: ImportReview | null;
  authorUserId: string;
  reason: string;
  reviewedFieldIds?: readonly string[];
}): { review: ImportReview; published: false; previousSnapshot: ConsolidatedSnapshot | null } {
  requireManage(input.actor, input.clientId, input.resource);
  const current = input.review ?? emptyReview();
  const previousSnapshot = current.confirmedSnapshot;
  return {
    published: false,
    previousSnapshot,
    review: {
      ...current,
      version: REVIEW_VERSION,
      revision: current.revision + 1,
      status: "DRAFT",
      idempotencyKey: null,
      confirmedSnapshot: previousSnapshot,
      reviewedFieldIds: input.reviewedFieldIds ? [...input.reviewedFieldIds] : current.reviewedFieldIds,
      authorUserId: input.authorUserId,
      reason: input.reason,
      disputeAuthorized: false,
      inaccuracyConfirmed: false,
    },
  };
}

function certifiedScores(
  snapshots: readonly ScoreInput[],
  reviewedFieldIds: readonly string[],
): CertifiedScore[] {
  const reviewed = new Set(reviewedFieldIds);
  const scores: CertifiedScore[] = [];
  for (const snapshot of snapshots) {
    const model = snapshot.modelFamily?.trim() || null;
    if (!reviewed.has(`score.${snapshot.bureau}`) || model == null || snapshot.score == null) continue;
    scores.push({
      bureau: snapshot.bureau,
      score: snapshot.score,
      modelFamily: model,
      modelVersion: snapshot.modelVersion ?? null,
    });
  }
  return scores;
}

export function confirmReview(input: {
  actor: CreditActor;
  clientId: string;
  resource: Scope;
  review: ImportReview | null;
  expectedRevision: number;
  idempotencyKey: string;
  reviewedFieldIds: readonly string[];
  identityDecisionIds: readonly string[];
  identities?: readonly IdentityDecision[];
  observations?: readonly BackfillObservation[];
  creditCaseId: string;
  asOf: string;
  confirmedReportIds: readonly string[];
  reportDate?: string | null;
  snapshots?: readonly ScoreInput[];
  items?: readonly ItemInput[];
  metricsBlocked?: boolean;
  authorUserId: string;
  reason: string;
  claims?: Map<string, ConfirmResult>;
}): ConfirmResult {
  requireManage(input.actor, input.clientId, input.resource);
  const current = input.review ?? emptyReview();
  const slot = `${input.resource.organizationId}|${input.clientId}|${current.revision}`;
  const claimed = input.claims?.get(slot);
  if (claimed) {
    if (claimed.review.idempotencyKey === input.idempotencyKey) {
      return { ...claimed, outcome: "REPLAY" };
    }
    throw new Error("REVISION_CONFLICT");
  }
  if (current.status === "CONFIRMED") {
    if (current.idempotencyKey === input.idempotencyKey && current.reportId) {
      return replay(current, input.snapshots ?? [], input.authorUserId, input.reason);
    }
    throw new Error("REVISION_CONFLICT");
  }
  if (input.expectedRevision !== current.revision) throw new Error("REVISION_CONFLICT");
  if (input.metricsBlocked) throw new Error("PUBLICATION_BLOCKED");

  const identities = input.identities ?? [];
  const fields = reviewFields({
    reportDate: input.reportDate,
    snapshots: input.snapshots,
    items: input.items,
    identities,
  });
  const reviewedIds = [
    ...input.reviewedFieldIds,
    ...input.identityDecisionIds.map((id) => `identity.${id}`),
  ];
  if (summarizeReview(fields, reviewedIds).criticalPending.length > 0) throw new Error("REVIEW_REQUIRED");

  const confirmed = identities.filter((decision) => decision.status === "CONFIRMED");
  const snapshot = buildConsolidatedSnapshot({
    actor: input.actor,
    clientId: input.clientId,
    creditCaseId: input.creditCaseId,
    observations: input.observations ?? [],
    confirmed,
    confirmedReportIds: input.confirmedReportIds,
    asOf: input.asOf,
  });
  const review: ImportReview = {
    ...current,
    version: REVIEW_VERSION,
    status: "CONFIRMED",
    idempotencyKey: input.idempotencyKey,
    reportId: current.reportId ?? `report:${input.idempotencyKey}`,
    confirmedSnapshot: snapshot,
    reviewedFieldIds: [...input.reviewedFieldIds],
    authorUserId: input.authorUserId,
    reason: input.reason,
    disputeAuthorized: false,
    inaccuracyConfirmed: false,
  };
  const result: ConfirmResult = {
    outcome: "PUBLISHED",
    review,
    certifiedScores: certifiedScores(input.snapshots ?? [], input.reviewedFieldIds),
    audit: {
      action: "IMPORT_CONFIRMED",
      authorUserId: input.authorUserId,
      reason: input.reason,
      revision: review.revision,
      idempotencyKey: input.idempotencyKey,
    },
    disputeAuthorized: false,
    inaccuracyConfirmed: false,
  };
  input.claims?.set(slot, result);
  return result;
}

function replay(
  review: ImportReview,
  snapshots: readonly ScoreInput[],
  authorUserId: string,
  reason: string,
): ConfirmResult {
  return {
    outcome: "REPLAY",
    review,
    certifiedScores: certifiedScores(snapshots, review.reviewedFieldIds),
    audit: {
      action: "IMPORT_CONFIRMED",
      authorUserId,
      reason,
      revision: review.revision,
      idempotencyKey: review.idempotencyKey ?? "",
    },
    disputeAuthorized: false,
    inaccuracyConfirmed: false,
  };
}
