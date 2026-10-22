/**
 * Afirmación del cliente sobre un dato reportado.
 * No inventa el testimonio, no envía carta y no crea una disputa.
 */

export const ASSERTION_VERSION = "t16-2026-10-21";

export type AssertionAnswer = "CORRECT" | "INCORRECT" | "UNKNOWN";

export type AssertionState =
  | "DRAFT"
  | "CLIENT_CONFIRMED"
  | "LETTER_READY"
  | "CLOSED_NO_ACTION";

export type AssertionBlock =
  | "STALE_REVISION"
  | "DOCUMENT_SCOPE"
  | "DOCUMENT_REVOKED"
  | "UNKNOWN"
  | "MISSING_CLAIM"
  | "SAME_REVIEWER";

export type AssertionDocument = {
  id: string;
  clientId: string;
  organizationId: string;
  revoked: boolean;
};

export type AssertionInput = {
  creditItemId: string;
  field: string;
  bureau: string;
  reportedValue: string | null;
  consumerClaim: string | null;
  answer: AssertionAnswer | null;
  evidenceDocumentIds: readonly string[];
  documents: readonly AssertionDocument[];
  clientId: string;
  organizationId: string;
  expectedRevision: number;
  currentRevision: number;
  clientActorId: string;
  reviewerId: string | null;
};

export type AssertionAssessment = {
  version: typeof ASSERTION_VERSION;
  state: AssertionState;
  staffReviewed: boolean;
  letterReady: boolean;
  block: AssertionBlock | null;
  letterReason: null;
  createsDispute: false;
  sendsLetter: false;
  confirmedFacts: string[];
};

const INVENTED =
  /identidad robada|stolen identity|identity theft/i;

export function assessAssertion(input: AssertionInput): AssertionAssessment {
  const confirmedFacts = factLines(input);
  const blocked = documentBlock(input) ?? (input.expectedRevision !== input.currentRevision ? "STALE_REVISION" : null);
  if (blocked) return result("DRAFT", false, false, blocked, confirmedFacts);
  if (input.answer == null) return result("DRAFT", false, false, null, confirmedFacts);
  if (input.answer === "UNKNOWN") return result("DRAFT", false, false, "UNKNOWN", confirmedFacts);
  if (input.answer === "CORRECT") return result("CLOSED_NO_ACTION", false, false, null, confirmedFacts);
  const claim = input.consumerClaim?.trim() ?? "";
  if (claim === "") return result("DRAFT", false, false, "MISSING_CLAIM", confirmedFacts);
  if (input.reviewerId == null) return result("CLIENT_CONFIRMED", false, false, null, [...confirmedFacts, claim]);
  if (input.reviewerId === input.clientActorId) {
    return result("CLIENT_CONFIRMED", false, false, "SAME_REVIEWER", [...confirmedFacts, claim]);
  }
  return result("LETTER_READY", true, true, null, [...confirmedFacts, claim]);
}

export function factLines(input: Pick<AssertionInput, "field" | "bureau" | "reportedValue" | "consumerClaim">): string[] {
  const lines: string[] = [];
  if (input.field.trim() !== "") lines.push(`campo: ${input.field.trim()}`);
  if (input.bureau.trim() !== "") lines.push(`buró: ${input.bureau.trim()}`);
  if (input.reportedValue != null && input.reportedValue.trim() !== "") {
    lines.push(`reportado: ${input.reportedValue.trim()}`);
  }
  return lines;
}

export function confineDraft(draft: string, confirmedFacts: readonly string[]): { text: string | null; rejected: boolean } {
  const corpus = confirmedFacts.join("\n");
  if (INVENTED.test(draft) && !INVENTED.test(corpus)) return { text: null, rejected: true };
  const dates = draft.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  if (dates.some((date) => !corpus.includes(date))) return { text: null, rejected: true };
  const payments = draft.match(/\$\s?\d[\d.,]*/g) ?? [];
  if (payments.some((payment) => !corpus.includes(payment))) return { text: null, rejected: true };
  return { text: draft, rejected: false };
}

function documentBlock(input: AssertionInput): AssertionBlock | null {
  for (const id of input.evidenceDocumentIds) {
    const document = input.documents.find((item) => item.id === id);
    if (!document || document.clientId !== input.clientId || document.organizationId !== input.organizationId) {
      return "DOCUMENT_SCOPE";
    }
    if (document.revoked) return "DOCUMENT_REVOKED";
  }
  return null;
}

function result(
  state: AssertionState,
  staffReviewed: boolean,
  letterReady: boolean,
  block: AssertionBlock | null,
  confirmedFacts: string[],
): AssertionAssessment {
  return {
    version: ASSERTION_VERSION,
    state,
    staffReviewed,
    letterReady,
    block,
    letterReason: null,
    createsDispute: false,
    sendsLetter: false,
    confirmedFacts,
  };
}
