import type { OrganizationContext } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { DomainError } from "@/src/server/errors";
import * as disputeService from "@/src/server/disputes";
import * as letterService from "@/src/server/letters";
import * as progressService from "@/src/server/progress-reports";
import { listMemberOptions } from "@/src/server/page-helpers";
import { prisma } from "@/src/lib/db";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";

export type EmbeddedRoundDetail = {
  caseId: string;
  clientId: string;
  round: {
    id: string;
    roundNumber: number;
    status: string;
    startedAt: Date;
    sentAt: Date | null;
    expectedReviewAt: Date | null;
    notes: string | null;
    lettersCount: number;
  };
  summary: {
    total: number;
    byOutcome: {
      deleted: number;
      updated: number;
      verified: number;
      notResponded: number;
      pending: number;
    };
    items: {
      id: string;
      bureau: string;
      disputeReason: string;
      action: string | null;
      status: string;
      outcome: string | null;
      creditItem: {
        creditorName: string;
        accountNumberMasked: string | null;
        balance: string | null;
      };
    }[];
  };
  eligible: {
    id: string;
    creditorName: string;
    accountNumberMasked: string | null;
    bureau: string;
    balance: string | null;
    isNegative: boolean;
  }[];
  templates: { id: string; name: string; bureau: string }[];
  letters: {
    id: string;
    bureau: string;
    subjectSnapshot: string;
    status: string;
    itemCount: number;
  }[];
  progressReports: {
    id: string;
    reportDate: Date;
    periodLabel: string;
  }[];
  members: { id: string; name: string }[];
  permissions: {
    canManageDisputes: boolean;
    canManageRounds: boolean;
    canManageLetters: boolean;
    canViewLetters: boolean;
  };
};

export type EmbeddedLetterDetail = {
  id: string;
  caseId: string;
  roundId: string;
  roundNumber: number;
  bureau: string;
  status: string;
  recipient: string;
  subjectSnapshot: string;
  contentSnapshot: string;
  finalizedAt: Date | null;
  generatedAt: Date;
  organizationName: string;
  organizationContact: string | null;
  timezone: string;
  folio: string;
  canManage: boolean;
};

export async function getEmbeddedRoundDetail(
  ctx: OrganizationContext,
  roundId: string,
): Promise<EmbeddedRoundDetail> {
  if (!can(ctx.role, "rounds.view")) {
    throw new DomainError("No tienes permiso para ver rondas.");
  }

  const detail = await disputeService.getRoundDetail(ctx, roundId);
  const { round, summary } = detail;

  const canManageDisputes = can(ctx.role, "disputes.manage");
  const canManageRounds = can(ctx.role, "rounds.manage");
  const canManageLetters = can(ctx.role, "letters.manage");
  const canViewLetters = can(ctx.role, "letters.view");

  const [members, eligible, templates, letters, progressReports] =
    await Promise.all([
      canManageRounds ? listMemberOptions(ctx) : Promise.resolve([]),
      canManageDisputes
        ? disputeService.listEligibleCreditItems(ctx, roundId)
        : Promise.resolve([]),
      canManageLetters
        ? letterService.ensureDefaultTemplates(ctx)
        : Promise.resolve([]),
      canViewLetters
        ? letterService.listLettersForRound(ctx, roundId)
        : Promise.resolve([]),
      canViewLetters
        ? progressService.listProgressReportsForRound(ctx, roundId)
        : Promise.resolve([]),
    ]);

  return {
    caseId: round.caseId,
    clientId: round.case.client.id,
    round: {
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      startedAt: round.startedAt,
      sentAt: round.sentAt,
      expectedReviewAt: round.expectedReviewAt,
      notes: round.notes,
      lettersCount: round.lettersCount,
    },
    summary: {
      total: summary.total,
      byOutcome: {
        deleted: summary.byOutcome.deleted,
        updated: summary.byOutcome.updated,
        verified: summary.byOutcome.verified,
        notResponded: summary.byOutcome.notResponded,
        pending: summary.byOutcome.pending,
      },
      items: summary.items.map((item) => ({
        id: item.id,
        bureau: item.bureau,
        disputeReason: item.disputeReason,
        action: item.action,
        status: item.status,
        outcome: item.outcome,
        creditItem: {
          creditorName: item.creditItem.creditorName,
          accountNumberMasked: item.creditItem.accountNumberMasked,
          balance:
            item.creditItem.balance != null
              ? item.creditItem.balance.toString()
              : null,
        },
      })),
    },
    eligible: eligible.map((i) => ({
      id: i.id,
      creditorName: i.creditorName,
      accountNumberMasked: i.accountNumberMasked,
      bureau: i.bureau,
      balance: i.balance != null ? i.balance.toString() : null,
      isNegative: i.isNegative,
    })),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      bureau: t.bureau ?? "EXPERIAN",
    })),
    letters: letters.map((letter) => ({
      id: letter.id,
      bureau: letter.bureau,
      subjectSnapshot: letter.subjectSnapshot,
      status: letter.status,
      itemCount: letter._count.items,
    })),
    progressReports: progressReports.map((report) => ({
      id: report.id,
      reportDate: report.reportDate,
      periodLabel: report.periodLabel,
    })),
    members,
    permissions: {
      canManageDisputes,
      canManageRounds,
      canManageLetters,
      canViewLetters,
    },
  };
}

export async function getEmbeddedLetterDetail(
  ctx: OrganizationContext,
  letterId: string,
): Promise<EmbeddedLetterDetail> {
  if (!can(ctx.role, "letters.view")) {
    throw new DomainError("No tienes permiso para ver cartas.");
  }

  const letter = await letterService.getLetter(ctx, letterId);
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  const contact = [settings?.addressLine1, settings?.phone, settings?.email]
    .filter(Boolean)
    .join(" · ");

  const folio = `LTR-${letter.round.roundNumber}-${letter.bureau.slice(0, 3)}`;

  return {
    id: letter.id,
    caseId: letter.round.caseId,
    roundId: letter.roundId,
    roundNumber: letter.round.roundNumber,
    bureau: letter.bureau,
    status: letter.status,
    recipient: letter.recipient,
    subjectSnapshot: letter.subjectSnapshot,
    contentSnapshot: letter.contentSnapshot,
    finalizedAt: letter.finalizedAt,
    generatedAt: letter.generatedAt,
    organizationName: settings?.legalName ?? "J&H Multiservices LLC",
    organizationContact: contact || null,
    timezone: settings?.timezone ?? "America/Chicago",
    folio: `${folio} · ${CREDIT_BUREAU_LABELS[letter.bureau] ?? letter.bureau}`,
    canManage: can(ctx.role, "letters.manage"),
  };
}

/** Resuelve clientId de un CreditCase para redirects legacy. */
export async function resolveClientIdForCase(
  ctx: OrganizationContext,
  caseId: string,
): Promise<string | null> {
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: { clientId: true },
  });
  return creditCase?.clientId ?? null;
}
