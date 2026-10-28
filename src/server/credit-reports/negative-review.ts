import type { CreditBureau } from "@prisma/client";
import { DomainError } from "@/src/server/errors";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import {
  disputeTextFor,
  groupNegativeDebts,
  type ClientAnswer,
  type NegativeDebt,
  type ReasonCode,
} from "@/src/lib/credit/negative-review";
import { selectClientActionPlanReport } from "@/src/server/credit-reports/action-plan";
import { cancelRound, createRound } from "@/src/server/rounds";
import { addDisputeItem } from "@/src/server/disputes";
import { createLetterDraft, ensureDefaultTemplates } from "@/src/server/letters";

/** fieldKey de la entrevista del cliente sobre una cuenta (CreditDisputeAssertion). */
const INTERVIEW_FIELD = "account";
const ANSWERS: ClientAnswer[] = ["NOT_MINE", "PAID", "WRONG_DATA", "CORRECT", "UNKNOWN"];

function num(value: { toNumber?: () => number } | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return typeof value.toNumber === "function" ? value.toNumber() : Number(value);
}

export type NegativeReviewDebt = NegativeDebt & {
  interview: { answer: ClientAnswer | null; words: string | null };
  /** Ya está en una ronda abierta (no se vuelve a ofrecer). */
  inOpenRound: boolean;
};

export type NegativeReview = {
  clientName: string;
  reportId: string;
  reportDate: Date;
  caseId: string;
  caseOpen: boolean;
  totalItems: number;
  /** Consultas duras guardadas del reporte (si se importó con fechas). */
  inquiries: { id: string; bureau: CreditBureau; creditorName: string; inquiryDate: Date | null }[];
  debts: NegativeReviewDebt[];
};

async function loadReportForClient(ctx: OrganizationContext, clientId: string, reportId?: string | null) {
  const id = reportId ?? (await selectClientActionPlanReport(ctx, clientId)).reportId;
  if (!id) throw new DomainError("Este cliente todavía no tiene reportes de crédito.");
  const report = await prisma.creditReport.findFirst({
    where: { id, organizationId: ctx.organizationId, clientId },
    include: {
      items: true,
      client: { select: { firstName: true, lastName: true } },
      case: { select: { id: true, state: true } },
    },
  });
  if (!report) throw new DomainError("Reporte de crédito no encontrado.");
  return report;
}

/** Cuentas negativas agrupadas por deuda, con motivos y la entrevista guardada. */
export async function getNegativeReview(
  ctx: OrganizationContext,
  clientId: string,
  reportId?: string | null,
): Promise<NegativeReview> {
  const report = await loadReportForClient(ctx, clientId, reportId);
  const debts = groupNegativeDebts(
    report.items.map((item) => ({
      id: item.id,
      creditorName: item.creditorName,
      accountNumberMasked: item.accountNumberMasked,
      accountType: item.accountType,
      bureau: item.bureau,
      balance: num(item.balance),
      creditLimit: num(item.creditLimit),
      dateOpened: item.dateOpened,
      dateReported: item.dateReported,
      accountStatus: item.accountStatus,
      paymentStatus: item.paymentStatus,
      openClosedStatus: item.openClosedStatus,
      remarks: item.remarks,
      ownershipType: item.ownershipType,
      isNegative: item.isNegative,
      negativeType: item.negativeType,
      monthlyPayment: num(item.monthlyPayment),
      pastDueAmount: num(item.pastDueAmount),
    })),
    report.reportDate,
  );
  const itemIds = debts.flatMap((debt) => debt.rows.map((row) => row.itemId));
  const [assertions, openDisputes, inquiries] = await Promise.all([
    prisma.creditDisputeAssertion.findMany({
      where: { organizationId: ctx.organizationId, clientId, creditItemId: { in: itemIds }, fieldKey: INTERVIEW_FIELD },
      orderBy: { updatedAt: "desc" },
      select: { creditItemId: true, assertedValue: true, reason: true },
    }),
    prisma.disputeItem.findMany({
      where: {
        organizationId: ctx.organizationId,
        creditItemId: { in: itemIds },
        status: { not: "CANCELLED" },
        round: { status: { notIn: ["CANCELLED", "COMPLETED"] } },
      },
      select: { creditItemId: true },
    }),
    prisma.creditInquiry.findMany({
      where: { organizationId: ctx.organizationId, reportId: report.id },
      orderBy: [{ inquiryDate: "desc" }],
      select: { id: true, bureau: true, creditorName: true, inquiryDate: true },
    }),
  ]);
  const disputed = new Set(openDisputes.map((d) => d.creditItemId));
  return {
    clientName: [report.client.firstName, report.client.lastName].filter(Boolean).join(" "),
    reportId: report.id,
    reportDate: report.reportDate,
    caseId: report.case.id,
    caseOpen: report.case.state === "OPEN",
    totalItems: report.items.length,
    inquiries,
    debts: debts.map((debt) => {
      const saved = assertions.find((a) => debt.rows.some((row) => row.itemId === a.creditItemId));
      const answer = ANSWERS.includes(saved?.assertedValue as ClientAnswer)
        ? (saved!.assertedValue as ClientAnswer)
        : null;
      return {
        ...debt,
        interview: { answer, words: saved?.reason ?? null },
        inOpenRound: debt.rows.some((row) => disputed.has(row.itemId)),
      };
    }),
  };
}

/** Guarda lo que dice el cliente sobre una deuda (una fila por buró). */
export async function saveNegativeInterview(
  ctx: OrganizationContext,
  input: { clientId: string; itemIds: string[]; answer: ClientAnswer | null; words: string | null },
) {
  const items = await prisma.creditItem.findMany({
    where: { id: { in: input.itemIds }, organizationId: ctx.organizationId, clientId: input.clientId },
    select: { id: true, bureau: true, negativeType: true },
  });
  if (items.length === 0) throw new DomainError("Cuenta no encontrada.");
  const words = input.words?.trim() ? input.words.trim().slice(0, 2000) : null;
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const existing = await tx.creditDisputeAssertion.findFirst({
        where: { organizationId: ctx.organizationId, creditItemId: item.id, fieldKey: INTERVIEW_FIELD },
        select: { id: true },
      });
      const data = { assertedValue: input.answer, reason: words, reportedValue: item.negativeType ?? null };
      if (existing) {
        await tx.creditDisputeAssertion.update({ where: { id: existing.id }, data });
      } else {
        await tx.creditDisputeAssertion.create({
          data: {
            organizationId: ctx.organizationId,
            clientId: input.clientId,
            creditItemId: item.id,
            bureau: item.bureau,
            fieldKey: INTERVIEW_FIELD,
            ...data,
          },
        });
      }
    }
  });
}

/**
 * Crea una ronda con las deudas elegidas: una disputa por cuenta y buró y un
 * borrador de carta por buró (plantilla FCRA de la organización).
 */
export async function createRoundFromNegativeReview(
  ctx: OrganizationContext,
  input: {
    clientId: string;
    reportId: string;
    selections: { itemIds: string[]; reasons: ReasonCode[] }[];
  },
): Promise<{ roundId: string; roundNumber: number; disputes: number; letters: number }> {
  const review = await getNegativeReview(ctx, input.clientId, input.reportId);
  if (!review.caseOpen) {
    throw new DomainError("El servicio de crédito de este cliente no está abierto.");
  }
  const chosen = input.selections
    .map((selection) => {
      const debt = review.debts.find((d) => d.rows.some((row) => selection.itemIds.includes(row.itemId)));
      if (!debt) return null;
      if (debt.inOpenRound) {
        throw new DomainError(`${debt.creditorName} ya está en una ronda abierta.`);
      }
      if (debt.interview.answer === "CORRECT") {
        throw new DomainError(`El cliente confirmó que ${debt.creditorName} es correcta; no se disputa.`);
      }
      const rows = debt.rows.filter((row) => selection.itemIds.includes(row.itemId));
      return rows.length > 0 ? { debt, rows, reasons: selection.reasons } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);
  if (chosen.length === 0) throw new DomainError("Elige al menos una cuenta para disputar.");

  const round = await createRound(ctx, {
    caseId: review.caseId,
    notes: `Creada desde Análisis de cuentas negativas (${chosen.length} deudas).`,
  });

  // Si algo falla a medias, la ronda se cancela para no dejarla incompleta.
  try {
    const byBureau = new Map<CreditBureau, string[]>();
    let disputes = 0;
    for (const { debt, rows, reasons } of chosen) {
      const text = disputeTextFor({
        reasons,
        answer: debt.interview.answer,
        clientWords: debt.interview.words,
      });
      for (const row of rows) {
        const item = await addDisputeItem(ctx, {
          roundId: round.id,
          creditItemId: row.itemId,
          bureau: row.bureau,
          disputeReason: text.reason,
          action: "Eliminar o corregir",
          disputeDetails: text.details,
        });
        byBureau.set(row.bureau, [...(byBureau.get(row.bureau) ?? []), item.id]);
        disputes += 1;
      }
    }

    const templates = await ensureDefaultTemplates(ctx);
    const template = templates.find((t) => t.active) ?? templates[0];
    let letters = 0;
    if (template) {
      for (const [bureau, disputeItemIds] of byBureau) {
        await createLetterDraft(ctx, { roundId: round.id, bureau, templateId: template.id, disputeItemIds });
        letters += 1;
      }
    }
    return { roundId: round.id, roundNumber: round.roundNumber, disputes, letters };
  } catch (error) {
    await cancelRound(ctx, round.id).catch(() => undefined);
    throw error;
  }
}
