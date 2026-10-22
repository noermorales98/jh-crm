/**
 * Revisión y confirmación de una importación.
 *
 *   npm run smoke:credit-review
 *
 * Sin red y sin DATABASE_URL.
 */
import { ForbiddenError } from "../../src/server/auth/guards";
import type { BackfillObservation } from "../../src/lib/credit/backfill";
import type { IdentityDecision } from "../../src/lib/credit/identity";
import {
  confirmReview,
  emptyReview,
  identityDecisionId,
  saveDraft,
} from "../../src/lib/credit/review";

function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`  ✗ ${label}`, detail ?? "");
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  ✓ ${label}`);
}

const actor = { organizationId: "org-a", role: "STAFF" as const };
const resource = { organizationId: "org-a", clientId: "client-1" };

function confirm(over: Partial<Parameters<typeof confirmReview>[0]> = {}) {
  return confirmReview({
    actor,
    clientId: "client-1",
    resource,
    review: null,
    expectedRevision: 0,
    idempotencyKey: "key-1",
    reviewedFieldIds: ["report.reportDate"],
    identityDecisionIds: [],
    creditCaseId: "case-1",
    asOf: "2024-06-01",
    confirmedReportIds: ["rep-1"],
    reportDate: "2024-06-01",
    authorUserId: "user-1",
    reason: "revisión",
    ...over,
  });
}

function observation(): BackfillObservation {
  return {
    id: "visa-ex",
    organizationId: "org-a",
    clientId: "client-1",
    reportId: "rep-1",
    bureau: "EXPERIAN",
    creditorName: "VISA",
    suffix: "4242",
    openedMonth: "2019-04",
    family: "REVOLVING",
    balanceCents: 100,
    reportDate: "2024-01-01",
    creditLimitCents: 10_000,
    canonicalTradelineId: null,
  };
}

function identity(status: IdentityDecision["status"]): IdentityDecision {
  return {
    observationIds: ["visa-ex"],
    canonicalId: status === "CONFIRMED" ? "can-visa" : null,
    status,
    signals: [],
    conflicts: [],
    reviewedBy: status === "CONFIRMED" ? "user-1" : null,
    identityVersion: status === "CONFIRMED" ? 1 : 0,
  };
}

function main() {
  console.log("\n[credit-review] confirmación");

  const claims = new Map();
  const first = confirm({ claims });
  const replay = confirm({ claims });
  check("la misma clave devuelve el mismo reporte", replay.outcome === "REPLAY" && replay.review.reportId === first.review.reportId);
  check("el snapshot confirmado no se copia de nuevo", replay.review.confirmedSnapshot === first.review.confirmedSnapshot);

  let conflict = false;
  try {
    confirm({ claims, idempotencyKey: "key-2" });
  } catch (error) {
    conflict = error instanceof Error && error.message === "REVISION_CONFLICT";
  }
  check("otro revisor no pisa la confirmación", conflict);

  const drafted = saveDraft({
    actor,
    clientId: "client-1",
    resource,
    review: null,
    authorUserId: "user-1",
    reason: "corrección",
  });
  check("el borrador no publica", drafted.published === false && drafted.review.status === "DRAFT" && drafted.review.confirmedSnapshot == null);

  let stale = false;
  try {
    confirm({ review: drafted.review, expectedRevision: 0 });
  } catch (error) {
    stale = error instanceof Error && error.message === "REVISION_CONFLICT";
  }
  check("una revisión vieja no confirma", stale);

  const published = confirm({
    review: drafted.review,
    expectedRevision: drafted.review.revision,
    idempotencyKey: "key-draft",
    snapshots: [{ bureau: "EXPERIAN", score: 700, modelFamily: null }],
    reviewedFieldIds: ["report.reportDate", "score.EXPERIAN"],
  });
  check("un score sin modelo no queda certificado", published.certifiedScores.length === 0);
  check("confirmar no autoriza disputa ni inexactitud", published.disputeAuthorized === false && published.inaccuracyConfirmed === false);

  const edited = saveDraft({
    actor,
    clientId: "client-1",
    resource,
    review: published.review,
    authorUserId: "user-2",
    reason: "edición posterior",
  });
  check(
    "la edición abre otra revisión y deja el snapshot",
    edited.review.revision === published.review.revision + 1 &&
      edited.previousSnapshot === published.review.confirmedSnapshot &&
      published.review.status === "CONFIRMED",
  );

  let blocked = false;
  try {
    confirm({ metricsBlocked: true, idempotencyKey: "partial" });
  } catch (error) {
    blocked = error instanceof Error && error.message === "PUBLICATION_BLOCKED";
  }
  const partialDraft = saveDraft({
    actor,
    clientId: "client-1",
    resource,
    review: null,
    authorUserId: "user-1",
    reason: "parcial",
  });
  check("un PDF parcial no se publica y sí se guarda en borrador", blocked && partialDraft.published === false);

  const proposed = identity("PROPOSED");
  let needsIdentity = false;
  try {
    confirm({ identities: [proposed], idempotencyKey: "proposed" });
  } catch (error) {
    needsIdentity = error instanceof Error && error.message === "REVIEW_REQUIRED";
  }
  const acknowledged = confirm({
    identities: [proposed],
    identityDecisionIds: [identityDecisionId(proposed)],
    idempotencyKey: "proposed-ok",
    observations: [observation()],
  });
  check("una identidad propuesta sin revisar bloquea la publicación", needsIdentity);
  check("reconocerla no la mete al snapshot", acknowledged.review.confirmedSnapshot?.accounts.length === 0);

  const merged = confirm({
    identities: [identity("CONFIRMED")],
    observations: [observation()],
    idempotencyKey: "confirmed-id",
  });
  check("solo la identidad confirmada entra al snapshot", merged.review.confirmedSnapshot?.accounts.length === 1);

  let forbidden = false;
  try {
    confirm({ actor: { organizationId: "org-a", role: "VIEWER" }, idempotencyKey: "viewer" });
  } catch (error) {
    forbidden = error instanceof ForbiddenError;
  }
  let crossed = false;
  try {
    confirm({
      resource: { organizationId: "org-b", clientId: "client-1" },
      idempotencyKey: "other-org",
    });
  } catch (error) {
    crossed = error instanceof Error && error.message === "SCOPE_MISMATCH";
  }
  check("sin permiso no se confirma", forbidden);
  check("otro tenant no se confirma", crossed);

  check("sin revisión previa la revisión es 0", emptyReview().revision === 0);

  console.log("\nOK credit-review\n");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
