/**
 * Checkpoint de ventanas AI en CreditPdfImportJob.proposalJson (durante RUNNING).
 * Permite reanudar tras timeout Hobby sin repetir ventanas ya hechas.
 */
import {
  creditPdfExtractionProposalSchema,
  type CreditPdfExtractionProposal,
} from "@/src/lib/validation/credit-import";

export const AI_CHECKPOINT_MARKER = "__aiCheckpoint" as const;

export type CreditPdfAiCheckpoint = {
  [AI_CHECKPOINT_MARKER]: true;
  windowTotal: number;
  windows: Array<{
    index: number;
    proposal: CreditPdfExtractionProposal;
  }>;
};

export function isCreditPdfAiCheckpoint(
  value: unknown,
): value is CreditPdfAiCheckpoint {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row[AI_CHECKPOINT_MARKER] !== true) return false;
  if (typeof row.windowTotal !== "number") return false;
  if (!Array.isArray(row.windows)) return false;
  return true;
}

export function parseCreditPdfAiCheckpoint(
  value: unknown,
): CreditPdfAiCheckpoint | null {
  if (!isCreditPdfAiCheckpoint(value)) return null;
  const windows: CreditPdfAiCheckpoint["windows"] = [];
  for (const entry of value.windows) {
    if (!entry || typeof entry !== "object") continue;
    const index = (entry as { index?: unknown }).index;
    const raw = (entry as { proposal?: unknown }).proposal;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
      continue;
    }
    const parsed = creditPdfExtractionProposalSchema.safeParse(raw);
    if (!parsed.success) continue;
    windows.push({ index, proposal: parsed.data });
  }
  return {
    [AI_CHECKPOINT_MARKER]: true,
    windowTotal: value.windowTotal,
    windows,
  };
}

export function checkpointToSeed(
  checkpoint: CreditPdfAiCheckpoint | null,
): Map<number, CreditPdfExtractionProposal> {
  const seed = new Map<number, CreditPdfExtractionProposal>();
  if (!checkpoint) return seed;
  for (const row of checkpoint.windows) {
    seed.set(row.index, row.proposal);
  }
  return seed;
}

export function upsertCheckpointWindow(
  previous: CreditPdfAiCheckpoint | null,
  input: {
    windowTotal: number;
    windowIndex: number;
    proposal: CreditPdfExtractionProposal;
  },
): CreditPdfAiCheckpoint {
  const byIndex = new Map<number, CreditPdfExtractionProposal>();
  if (previous) {
    for (const row of previous.windows) {
      byIndex.set(row.index, row.proposal);
    }
  }
  byIndex.set(input.windowIndex, input.proposal);
  const windows = [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, proposal]) => ({ index, proposal }));
  return {
    [AI_CHECKPOINT_MARKER]: true,
    windowTotal: input.windowTotal,
    windows,
  };
}
