/**
 * Auto-confirma un CreditPdfImportJob SUCCEEDED elegible (sin UI).
 * Si no es elegible o falla, el job queda para revisión manual.
 */
import {
  ForbiddenError,
  type OrganizationContext,
} from "@/src/server/auth/guards";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import {
  pdfImportConfirmBlocked,
  proposedPdfReportDate,
} from "@/src/lib/credit/pdf-review";
import { identitiesFromProposal } from "@/src/lib/credit/confirm-proposal";
import { reviewFields } from "@/src/lib/credit/review";
import {
  creditPdfExtractionProposalSchema,
  type ConfirmCreditPdfImportInput,
  type CreditPdfExtractionProposal,
} from "@/src/lib/validation/credit-import";
import { confirmCreditPdfImport } from "./index";

export type AutoConfirmResult =
  | { applied: true; reportId: string; caseId: string; clientId: string }
  | { applied: false; reason: string };

function empty(v: string | null | undefined) {
  return !v?.trim();
}

function logAuto(
  event: string,
  data: Record<string, string | number | boolean | null>,
) {
  console.info("[credit-pdf-auto-confirm]", event, data);
}

export function isCreditPdfAutoConfirmEligible(
  proposal: CreditPdfExtractionProposal,
): { ok: true } | { ok: false; reason: string } {
  if (pdfImportConfirmBlocked(proposal.coverage)) {
    return { ok: false, reason: "metrics_blocked" };
  }
  if (!proposedPdfReportDate(proposal.report?.reportDate)) {
    return { ok: false, reason: "missing_report_date" };
  }
  return { ok: true };
}

function buildApplyClientFields(
  client: {
    firstName: string;
    lastName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  },
  patch: NonNullable<CreditPdfExtractionProposal["client"]> | null,
): ConfirmCreditPdfImportInput["applyClientFields"] {
  if (!patch) return {};
  const apply: ConfirmCreditPdfImportInput["applyClientFields"] = {};
  if (patch.firstName?.trim() && empty(client.firstName)) apply.firstName = true;
  if (patch.lastName?.trim() && empty(client.lastName)) apply.lastName = true;
  if (patch.addressLine1?.trim() && empty(client.addressLine1))
    apply.addressLine1 = true;
  if (patch.addressLine2?.trim() && empty(client.addressLine2))
    apply.addressLine2 = true;
  if (patch.city?.trim() && empty(client.city)) apply.city = true;
  if (patch.state?.trim() && empty(client.state)) apply.state = true;
  if (patch.postalCode?.trim() && empty(client.postalCode)) apply.postalCode = true;
  if (patch.country?.trim() && empty(client.country)) apply.country = true;
  return apply;
}

/**
 * Intenta publicar el reporte del job. No lanza: errores → applied:false.
 */
export async function autoConfirmCreditPdfImportIfEligible(
  jobId: string,
): Promise<AutoConfirmResult> {
  const job = await prisma.creditPdfImportJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      phase: true,
      organizationId: true,
      createdById: true,
      caseId: true,
      clientId: true,
      documentId: true,
      suggestedReportType: true,
      proposalJson: true,
      currentClientJson: true,
    },
  });

  if (!job) return { applied: false, reason: "job_not_found" };
  if (job.status !== "SUCCEEDED") {
    return { applied: false, reason: "not_succeeded" };
  }
  if (job.phase === "confirmed" || job.phase === "confirming") {
    const sealed = creditPdfExtractionProposalSchema.safeParse(job.proposalJson);
    const reportId = sealed.success ? sealed.data.review?.reportId : null;
    if (reportId) {
      return {
        applied: true,
        reportId,
        caseId: job.caseId,
        clientId: job.clientId,
      };
    }
    return { applied: false, reason: "already_confirmed" };
  }

  const parsed = creditPdfExtractionProposalSchema.safeParse(job.proposalJson);
  if (!parsed.success) {
    return { applied: false, reason: "proposal_unparsed" };
  }
  const proposal = parsed.data;
  const eligible = isCreditPdfAutoConfirmEligible(proposal);
  if (!eligible.ok) {
    logAuto("skip", { jobId, reason: eligible.reason });
    return { applied: false, reason: eligible.reason };
  }

  const member = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: job.createdById,
        organizationId: job.organizationId,
      },
    },
    select: { role: true },
  });
  if (!member) {
    return { applied: false, reason: "creator_not_member" };
  }

  const ctx: OrganizationContext = {
    userId: job.createdById,
    organizationId: job.organizationId,
    role: member.role,
  };

  const current =
    (job.currentClientJson as {
      firstName: string;
      lastName: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
    } | null) ?? {
      firstName: "",
      lastName: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    };

  const reportDateStr = proposedPdfReportDate(proposal.report?.reportDate);
  const items = proposal.report?.items ?? [];
  const selectedItemIndexes = items.map((_, index) => index);
  const identities = identitiesFromProposal(proposal);
  const fields = reviewFields({
    reportDate: reportDateStr,
    snapshots: proposal.report?.snapshots,
    items,
    identities,
  });
  const reviewedFieldIds = fields
    .filter((field) => field.critical)
    .map((field) => field.id);

  const reportType =
    job.suggestedReportType === "INITIAL" ||
    job.suggestedReportType === "UPDATE" ||
    job.suggestedReportType === "MANUAL"
      ? job.suggestedReportType
      : proposal.report?.typeHint === "INITIAL" ||
          proposal.report?.typeHint === "UPDATE" ||
          proposal.report?.typeHint === "MANUAL"
        ? proposal.report.typeHint
        : "UPDATE";

  const input: ConfirmCreditPdfImportInput = {
    caseId: job.caseId,
    documentId: job.documentId,
    documentKind: proposal.documentKind,
    reportType,
    reportDate: new Date(`${reportDateStr}T12:00:00.000Z`),
    provider: proposal.report?.provider ?? null,
    notes: proposal.report?.notes ?? null,
    snapshots: [],
    items: [],
    selectedItemIndexes,
    applyClientFields: buildApplyClientFields(
      current,
      proposal.client ?? null,
    ),
    clientPatch: proposal.client ?? null,
    ssnFull: null,
    overwriteClient: false,
    expectedRevision: proposal.review?.revision ?? 0,
    idempotencyKey: job.id,
    reason: "confirmación automática tras análisis",
    reviewedFieldIds,
    identityDecisionIds: [],
  };

  try {
    const result = await confirmCreditPdfImport(ctx, input);
    logAuto("applied", {
      jobId,
      reportId: result.reportId,
    });
    return {
      applied: true,
      reportId: result.reportId,
      caseId: result.caseId,
      clientId: result.clientId,
    };
  } catch (error) {
    const reason =
      error instanceof DomainError || error instanceof ForbiddenError
        ? "domain_or_forbidden"
        : "confirm_failed";
    logAuto("failed", { jobId, reason });
    return { applied: false, reason };
  }
}
