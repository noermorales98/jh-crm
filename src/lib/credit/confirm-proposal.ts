/**
 * Ancla la confirmación de import PDF a proposalJson (no al body del cliente).
 * Identidades y selección de items solo desde la propuesta almacenada.
 */
import { DomainError } from "@/src/server/errors";
import type { IdentityDecision } from "@/src/lib/credit/identity";
import { identityDecisionId } from "@/src/lib/credit/review";
import type { CreditPdfExtractionProposal } from "@/src/lib/validation/credit-import";

export type ProposalSnapshot = NonNullable<
  NonNullable<CreditPdfExtractionProposal["report"]>["snapshots"]
>[number];

export type ProposalItem = NonNullable<
  NonNullable<CreditPdfExtractionProposal["report"]>["items"]
>[number];

export function identitiesFromProposal(
  proposal: CreditPdfExtractionProposal,
): IdentityDecision[] {
  const raw = proposal.identities ?? [];
  return raw.map((row) => ({
    observationIds: [...row.observationIds],
    canonicalId: row.canonicalId ?? null,
    status: row.status,
    signals: [...(row.signals ?? [])],
    conflicts: [...(row.conflicts ?? [])],
    reviewedBy: row.reviewedBy ?? null,
    identityVersion: row.identityVersion ?? 0,
  }));
}

export function assertIdentityDecisionIdsAllowed(
  identities: readonly IdentityDecision[],
  identityDecisionIds: readonly string[],
): void {
  const allowed = new Set(identities.map(identityDecisionId));
  for (const id of identityDecisionIds) {
    if (!allowed.has(id)) {
      throw new DomainError(
        "Una decisión de identidad no pertenece a la propuesta.",
      );
    }
  }
}

/**
 * Snapshots/items canónicos: solo proposalJson.
 * `selectedItemIndexes` elige un subconjunto; índices fuera de rango → error.
 */
export function resolveConfirmPayloadFromProposal(input: {
  proposal: CreditPdfExtractionProposal;
  documentKind: CreditPdfExtractionProposal["documentKind"];
  selectedItemIndexes?: readonly number[] | null;
}): { snapshots: ProposalSnapshot[]; items: ProposalItem[] } {
  const report = input.proposal.report;
  if (!report) {
    throw new DomainError("La propuesta no tiene reporte para confirmar.");
  }
  const snapshots = [...(report.snapshots ?? [])];
  if (input.documentKind === "CLIENT_PROGRESS_REPORT") {
    return { snapshots, items: [] };
  }
  const allItems = [...(report.items ?? [])];
  const indexes = input.selectedItemIndexes;
  if (indexes == null || indexes.length === 0) {
    return { snapshots, items: allItems };
  }
  const seen = new Set<number>();
  const items: ProposalItem[] = [];
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index >= allItems.length) {
      throw new DomainError(
        "Un índice de ítem no pertenece a la propuesta almacenada.",
      );
    }
    if (seen.has(index)) continue;
    seen.add(index);
    items.push(allItems[index]!);
  }
  return { snapshots, items };
}
