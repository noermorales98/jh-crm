"use server";

import { requirePermission } from "@/src/server/auth/guards";
import { actionFail, actionOk, isNextControlError, type ActionResult } from "@/src/server/errors";
import { getRoundDetail } from "@/src/server/disputes";
import { getPaymentDetail } from "@/src/server/payments";

export async function peekRoundAction(
  roundId: string,
): Promise<
  ActionResult<{
    id: string;
    roundNumber: number;
    status: string;
    sentAt: Date | null;
    expectedReviewAt: Date | null;
    reviewedAt: Date | null;
    startedAt: Date;
    disputedItemsCount: number;
    caseId: string;
    caseCode: string;
    items: {
      id: string;
      bureau: string;
      creditorName: string;
      disputeReason: string;
      status: string;
      outcome: string | null;
    }[];
  }>
> {
  try {
    const ctx = await requirePermission("rounds.view");
    const { round, summary } = await getRoundDetail(ctx, roundId);
    return actionOk({
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      sentAt: round.sentAt,
      expectedReviewAt: round.expectedReviewAt,
      reviewedAt: round.reviewedAt,
      startedAt: round.startedAt,
      disputedItemsCount: round.disputedItemsCount,
      caseId: round.case.id,
      caseCode: round.case.caseCode,
      items: summary.items.map((it) => ({
        id: it.id,
        bureau: it.bureau,
        creditorName: it.creditItem.creditorName,
        disputeReason: it.disputeReason,
        status: it.status,
        outcome: it.outcome,
      })),
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function peekPaymentAction(
  paymentId: string,
): Promise<
  ActionResult<{
    id: string;
    amount: string;
    currency: string;
    method: string;
    status: string;
    reference: string | null;
    dueAt: Date | null;
    receivedAt: Date | null;
    notes: string | null;
    clientId: string;
    caseCode: string | null;
    quoteFolio: string | null;
    receiptId: string | null;
  }>
> {
  try {
    const ctx = await requirePermission("payments.view");
    const payment = await getPaymentDetail(ctx, paymentId);
    return actionOk({
      id: payment.id,
      amount: payment.amount.toString(),
      currency: payment.currency,
      method: payment.method,
      status: payment.status,
      reference: payment.reference,
      dueAt: payment.dueAt,
      receivedAt: payment.receivedAt,
      notes: payment.notes,
      clientId: payment.client.id,
      caseCode: payment.case?.caseCode ?? null,
      quoteFolio: payment.quote?.folio ?? null,
      receiptId: payment.receipt?.id ?? null,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
