/**
 * Lectura de una ronda: borrador, envío, recepción y plazo.
 * No inventa 30 días ni convierte un PDF en respuesta oficial.
 */

export const ROUND_TIMING_VERSION = "t17-2026-10-21";
export const DUE_UNDETERMINED_LABEL = "pendiente de determinar";

export type DueAtStatus = "VERIFIED_POLICY" | "ESTIMATED" | "UNDETERMINED";
export type ReceptionStatus = "ACTUAL" | "ESTIMATED" | "UNKNOWN";
export type SendChannel = "MAIL" | "SIMULATOR" | "EXTERNAL";

export type RoundTimingInput = {
  phase: "DRAFT" | "PREPARING" | "READY" | "SENT" | "RECEIVED" | "IN_REVIEW" | "ANSWERED";
  sentAt: string | null;
  receivedAt: string | null;
  estimatedReceivedAt: string | null;
  deadlinePolicyId: string | null;
  deadlinePolicyVersion: number | null;
  policyDurationDays: number | null;
  receptionRequired: boolean;
};

export type RoundTiming = {
  version: typeof ROUND_TIMING_VERSION;
  sentAt: string | null;
  receivedAt: string | null;
  estimatedReceivedAt: string | null;
  reception: ReceptionStatus;
  deadlinePolicyId: string | null;
  deadlinePolicyVersion: number | null;
  dueAt: string | null;
  dueAtStatus: DueAtStatus;
  appearsSent: boolean;
};

export type ShipmentInput = {
  idempotencyKey: string;
  channel: SendChannel;
  recipient: string;
  authorized: boolean;
  assertionReady: boolean;
  clientId: string;
  organizationId: string;
  document: {
    clientId: string;
    organizationId: string;
    revoked: boolean;
  } | null;
};

export type SendResult = {
  sent: boolean;
  simulated: boolean;
  duplicate: boolean;
  block: "NOT_READY" | "UNAUTHORIZED" | "DOCUMENT" | null;
};

export type OfficialResponseInput = {
  source: "OFFICIAL" | "PDF";
  disposition: string | null;
  actorId: string | null;
  reason: string | null;
  documentId: string | null;
  clientId: string;
  organizationId: string;
  document: {
    clientId: string;
    organizationId: string;
    revoked: boolean;
  } | null;
};

export type OfficialResponse = {
  applied: boolean;
  disposition: string | null;
  block: "INFERRED" | "INCOMPLETE" | "DOCUMENT" | null;
};

export function roundTiming(input: RoundTimingInput): RoundTiming {
  const draft = input.phase === "DRAFT" || input.phase === "PREPARING";
  const sentAt = draft ? null : input.sentAt;
  const policyReady =
    input.deadlinePolicyId != null &&
    input.deadlinePolicyId.trim() !== "" &&
    input.deadlinePolicyVersion != null &&
    Number.isInteger(input.policyDurationDays) &&
    (input.policyDurationDays ?? 0) > 0;
  const base = input.receivedAt;
  const dueAt =
    policyReady && base != null && (!input.receptionRequired || input.receivedAt != null)
      ? addDays(base, input.policyDurationDays ?? 0)
      : null;
  return {
    version: ROUND_TIMING_VERSION,
    sentAt,
    receivedAt: input.receivedAt,
    estimatedReceivedAt: input.estimatedReceivedAt,
    reception: input.receivedAt ? "ACTUAL" : input.estimatedReceivedAt ? "ESTIMATED" : "UNKNOWN",
    deadlinePolicyId: policyReady ? input.deadlinePolicyId : null,
    deadlinePolicyVersion: policyReady ? input.deadlinePolicyVersion : null,
    dueAt,
    dueAtStatus: dueAt == null ? "UNDETERMINED" : "VERIFIED_POLICY",
    appearsSent: !draft && sentAt != null,
  };
}

export function recordSend(input: ShipmentInput, priorKeys: readonly string[]): SendResult {
  if (priorKeys.includes(input.idempotencyKey)) {
    return { sent: false, simulated: false, duplicate: true, block: null };
  }
  if (!input.assertionReady) return { sent: false, simulated: false, duplicate: false, block: "NOT_READY" };
  if (!documentAllowed(input.document, input.clientId, input.organizationId)) {
    return { sent: false, simulated: false, duplicate: false, block: "DOCUMENT" };
  }
  if (input.channel === "SIMULATOR") return { sent: false, simulated: true, duplicate: false, block: null };
  if (input.channel === "EXTERNAL" && !input.authorized) {
    return { sent: false, simulated: false, duplicate: false, block: "UNAUTHORIZED" };
  }
  return { sent: true, simulated: false, duplicate: false, block: null };
}

export function recordOfficialResponse(input: OfficialResponseInput): OfficialResponse {
  if (input.source === "PDF") return { applied: false, disposition: null, block: "INFERRED" };
  const reason = input.reason?.trim() ?? "";
  const disposition = input.disposition?.trim() ?? "";
  if (input.actorId == null || input.actorId.trim() === "" || reason === "" || input.documentId == null || disposition === "") {
    return { applied: false, disposition: null, block: "INCOMPLETE" };
  }
  if (input.document == null || !documentAllowed(input.document, input.clientId, input.organizationId)) {
    return { applied: false, disposition: null, block: "DOCUMENT" };
  }
  return { applied: true, disposition, block: null };
}

function documentAllowed(
  document: { clientId: string; organizationId: string; revoked: boolean } | null,
  clientId: string,
  organizationId: string,
): boolean {
  if (document == null) return true;
  if (document.revoked) return false;
  return document.clientId === clientId && document.organizationId === organizationId;
}

function addDays(isoDate: string, days: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isInteger(days) || days <= 0) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year == null || month == null || day == null) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  utc.setUTCDate(utc.getUTCDate() + days);
  const nextMonth = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(utc.getUTCDate()).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}
