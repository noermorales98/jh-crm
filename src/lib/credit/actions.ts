/**
 * Acciones derivadas del reporte.
 * La prioridad es una orden fija. No promete puntos ni abre una carta.
 */
import { ANOMALY_NOT_INACCURACY } from "@/src/lib/credit/anomalies";
import { AU_LIMIT_NOT_CAPACITY } from "@/src/lib/credit/ownership";

export const ACTION_POLICY_VERSION = "t19-2026-10-21";

export const ACTION_PRIORITY_RANK = {
  VERIFY_DATA: "HIGH",
  INTERVIEW: "HIGH",
  OBLIGATION: "MEDIUM",
  REVIEW_DISCREPANCY: "LOW",
  DESCRIBE_AU: "LOW",
} as const;

export const ACTION_PRIORITY_LABEL = {
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baja",
} as const;

export const ACTION_KIND_LABEL = {
  VERIFY_DATA: "Verificar datos",
  INTERVIEW: "Entrevista pendiente",
  OBLIGATION: "Escenario de utilización",
  REVIEW_DISCREPANCY: "Revisar diferencia",
  DESCRIBE_AU: "Usuario autorizado",
} as const;

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

export type ActionKind = keyof typeof ACTION_PRIORITY_RANK;
export type ActionPriority = (typeof ACTION_PRIORITY_RANK)[ActionKind];
export type ActionStatus = "TODO" | "IN_PROGRESS" | "DONE" | "DISMISSED";

export type CreditAction = {
  idempotencyKey: string;
  kind: ActionKind;
  priority: ActionPriority;
  reasonCodes: string[];
  observationIds: string[];
  policyVersion: typeof ACTION_POLICY_VERSION;
  ownerId: string | null;
  dueAt: string | null;
  status: ActionStatus;
  reviewNote: string | null;
  summary: string;
  predictedScorePoints: null;
  provesInaccuracy: false;
  createsDispute: false;
};

export type ActionInterviewState =
  | "DRAFT"
  | "CLIENT_CONFIRMED"
  | "LETTER_READY"
  | "CLOSED_NO_ACTION";

export type ActionPlanInput = {
  clientId: string;
  snapshotId: string;
  coverage: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  missingFields: readonly { observationId: string; field: string }[];
  interviews: readonly { observationId: string; state: ActionInterviewState }[];
  scenario: {
    aggregateStatus: "KNOWN" | "PARTIAL" | "NOT_APPLICABLE";
    targetBps: number | null;
    paydownCents: number | null;
    observationIds: readonly string[];
  } | null;
  discrepancies: readonly { canonicalId: string; observationIds: readonly string[] }[];
  authorizedUsers: readonly { canonicalId: string; observationIds: readonly string[] }[];
};

export function buildCreditActions(
  input: ActionPlanInput,
  prior: readonly CreditAction[],
): CreditAction[] {
  const derived = derive(input);
  const priorByKey = new Map(prior.map((action) => [action.idempotencyKey, action]));
  const seen = new Set<string>();
  const merged: CreditAction[] = [];

  for (const action of derived) {
    if (seen.has(action.idempotencyKey)) continue;
    seen.add(action.idempotencyKey);
    const existing = priorByKey.get(action.idempotencyKey);
    merged.push(
      existing
        ? {
            ...action,
            ownerId: existing.ownerId,
            dueAt: existing.dueAt,
            status: existing.status,
            reviewNote: existing.reviewNote,
          }
        : action,
    );
  }

  for (const existing of prior) {
    if (seen.has(existing.idempotencyKey)) continue;
    if (existing.status !== "DONE" && existing.status !== "DISMISSED") continue;
    seen.add(existing.idempotencyKey);
    merged.push(existing);
  }

  return merged.sort(byAction);
}

export function closeCreditAction(
  action: CreditAction,
  status: "DONE" | "DISMISSED",
  note: string,
): CreditAction {
  const reviewNote = note.trim();
  if (!reviewNote) return action;
  return { ...action, status, reviewNote };
}

export function confineActionDraft(
  actions: readonly CreditAction[],
  draft: string,
): { accepted: boolean; actions: readonly CreditAction[] } {
  const corpus = JSON.stringify(actions);
  const inventedPoints = /\+\s?\d+|puntos FICO/i.test(draft);
  const numbers = draft.match(/\d+/g) ?? [];
  const foreignNumber = numbers.some((value) => !corpus.includes(value));
  const foreignPriority = (["HIGH", "MEDIUM", "LOW"] as const).some(
    (priority) => draft.includes(priority) && !actions.some((action) => action.priority === priority),
  );
  return {
    accepted: !inventedPoints && !foreignNumber && !foreignPriority,
    actions,
  };
}

function derive(input: ActionPlanInput): CreditAction[] {
  const actions: CreditAction[] = [];
  if (input.coverage !== "COMPLETE") {
    actions.push(
      action(input, {
        kind: "VERIFY_DATA",
        field: "coverage",
        reasonCodes: ["COVERAGE"],
        observationIds: [],
        summary: "La cobertura del reporte no alcanza para certificar el plan.",
      }),
    );
  }
  for (const missing of input.missingFields) {
    const field = missing.field.trim();
    const observationId = missing.observationId.trim();
    if (!field || !observationId) continue;
    actions.push(
      action(input, {
        kind: "VERIFY_DATA",
        field: `${observationId}:${field}`,
        reasonCodes: ["MISSING_FIELD"],
        observationIds: [observationId],
        summary: `Falta ${field}.`,
      }),
    );
  }
  for (const interview of input.interviews) {
    if (interview.state !== "DRAFT") continue;
    const observationId = interview.observationId.trim();
    if (!observationId) continue;
    actions.push(
      action(input, {
        kind: "INTERVIEW",
        field: observationId,
        reasonCodes: ["INTERVIEW_PENDING"],
        observationIds: [observationId],
        summary: "La entrevista del cliente sigue pendiente. No crea una carta.",
      }),
    );
  }
  const scenario = input.scenario;
  if (
    scenario != null &&
    scenario.aggregateStatus === "KNOWN" &&
    Number.isInteger(scenario.paydownCents) &&
    Number.isInteger(scenario.targetBps)
  ) {
    actions.push(
      action(input, {
        kind: "OBLIGATION",
        field: "utilization",
        reasonCodes: ["UTILIZATION_SCENARIO"],
        observationIds: [...scenario.observationIds],
        summary: `El escenario elegido pide ${scenario.paydownCents} centavos hacia ${scenario.targetBps} basis points. No predice puntos.`,
      }),
    );
  }
  for (const discrepancy of input.discrepancies) {
    const canonicalId = discrepancy.canonicalId.trim();
    if (!canonicalId) continue;
    actions.push(
      action(input, {
        kind: "REVIEW_DISCREPANCY",
        field: canonicalId,
        reasonCodes: ["DISCREPANCY"],
        observationIds: [...discrepancy.observationIds],
        summary: ANOMALY_NOT_INACCURACY,
      }),
    );
  }
  for (const account of input.authorizedUsers) {
    const canonicalId = account.canonicalId.trim();
    if (!canonicalId) continue;
    actions.push(
      action(input, {
        kind: "DESCRIBE_AU",
        field: canonicalId,
        reasonCodes: ["AUTHORIZED_USER"],
        observationIds: [...account.observationIds],
        summary: AU_LIMIT_NOT_CAPACITY,
      }),
    );
  }
  return actions;
}

function action(
  input: ActionPlanInput,
  fields: {
    kind: ActionKind;
    field: string;
    reasonCodes: string[];
    observationIds: string[];
    summary: string;
  },
): CreditAction {
  return {
    idempotencyKey: `${input.clientId}|${input.snapshotId}|${fields.kind}|${fields.field}`,
    kind: fields.kind,
    priority: ACTION_PRIORITY_RANK[fields.kind],
    reasonCodes: fields.reasonCodes,
    observationIds: fields.observationIds,
    policyVersion: ACTION_POLICY_VERSION,
    ownerId: null,
    dueAt: null,
    status: "TODO",
    reviewNote: null,
    summary: fields.summary,
    predictedScorePoints: null,
    provesInaccuracy: false,
    createsDispute: false,
  };
}

function byAction(left: CreditAction, right: CreditAction): number {
  const rank = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
  if (rank !== 0) return rank;
  if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
  if (left.idempotencyKey !== right.idempotencyKey) {
    return left.idempotencyKey < right.idempotencyKey ? -1 : 1;
  }
  return 0;
}
