import { Prisma, type PaymentMethod, type PaymentStatus, type QuoteStatus } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { nextReceiptFolio } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import { writeAuditLog } from "@/src/server/audit";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext, toAuditContext } from "@/src/server/context";
import { syncInstallmentOnPaymentReceived } from "@/src/server/payment-plans";
import { ensureTaskForPayment } from "@/src/server/automations";

async function syncPaymentWorkQueue(ctx: OrganizationContext, paymentId: string) {
  try {
    await ensureTaskForPayment(ctx, paymentId);
  } catch (error) {
    console.error("[payments] ensureTaskForPayment:", error);
  }
}
/**
 * Pagos y recibos. Flujo de pago RECIBIDO (una sola transacción):
 *   Payment(RECEIVED) → recálculo de Quote (PARTIAL/PAID) → Receipt
 *   → ActivityLog(PAYMENT_RECORDED, RECEIPT_CREATED) → AuditLog(PAYMENT_RECEIVED)
 *
 * Nunca se edita un pago RECEIVED silenciosamente: solo cancelPayment
 * (PENDING) o refundPaymentRecord (RECEIVED), ambos con auditoría.
 */

const dec = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const money = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface RegisterPaymentData {
  clientId: string;
  caseId?: string | null;
  quoteId?: string | null;
  amount: Prisma.Decimal | number | string;
  method: PaymentMethod;
  /** PENDING (con dueAt) o RECEIVED (default). */
  status?: "PENDING" | "RECEIVED";
  reference?: string | null;
  dueAt?: Date | null;
  receivedAt?: Date | null;
  notes?: string | null;
}

export interface UpdatePendingPaymentData {
  amount?: Prisma.Decimal | number | string;
  method?: PaymentMethod;
  reference?: string | null;
  dueAt?: Date | null;
  notes?: string | null;
}

export interface PaymentListFilters {
  status?: PaymentStatus;
  method?: PaymentMethod;
  clientId?: string;
  /** Scope CL-003: pagos de un CreditCase / servicio. */
  caseId?: string;
  quoteId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

const PAYMENT_LIST_SELECT = {
  id: true,
  amount: true,
  currency: true,
  method: true,
  status: true,
  reference: true,
  dueAt: true,
  receivedAt: true,
  notes: true,
  createdAt: true,
  client: {
    select: {
      id: true,
      clientCode: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  },
  case: { select: { id: true, caseCode: true } },
  quote: { select: { id: true, folio: true, status: true } },
  receipt: { select: { id: true, folio: true, status: true } },
} satisfies Prisma.PaymentSelect;

async function getPaymentOrThrow(ctx: OrganizationContext, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, organizationId: ctx.organizationId },
    include: { receipt: true },
  });
  if (!payment) throw new DomainError("Pago no encontrado.");
  return payment;
}

async function sumReceivedForQuote(
  tx: Prisma.TransactionClient,
  quoteId: string,
): Promise<Prisma.Decimal> {
  const agg = await tx.payment.aggregate({
    where: { quoteId, status: "RECEIVED" },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? new Prisma.Decimal(0);
}

/**
 * Recalcula el estado de pago de una cotización comparando lo recibido
 * contra el total. Crea QuoteEvents en las transiciones. Devuelve el
 * nuevo estado (o null si no hay cotización ligada).
 */
async function syncQuotePaymentStatus(
  tx: Prisma.TransactionClient,
  ctx: OrganizationContext,
  quoteId: string,
): Promise<QuoteStatus | null> {
  const quote = await tx.quote.findFirst({
    where: { id: quoteId, organizationId: ctx.organizationId },
  });
  if (!quote) return null;
  if (quote.status === "CANCELLED" || quote.status === "REJECTED") return quote.status;

  const paid = money(await sumReceivedForQuote(tx, quoteId));
  const total = money(quote.total);

  let next: QuoteStatus;
  if (total.gt(0) && paid.gte(total)) {
    next = "PAID";
  } else if (paid.gt(0)) {
    next = "PARTIAL";
  } else if (quote.status === "PARTIAL" || quote.status === "PAID") {
    // Todos los pagos se reembolsaron/anularon: vuelve al estado previo.
    next = quote.acceptedAt ? "ACCEPTED" : quote.sentAt ? "SENT" : "DRAFT";
  } else {
    next = quote.status;
  }

  if (next !== quote.status) {
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: next,
        paidAt: next === "PAID" ? (quote.paidAt ?? new Date()) : null,
      },
    });
    if (next === "PARTIAL" && quote.status !== "PARTIAL") {
      await tx.quoteEvent.create({
        data: {
          organizationId: ctx.organizationId,
          quoteId: quote.id,
          type: "PARTIALLY_PAID",
          description: `Pago parcial registrado (${paid.toString()} de ${total.toString()} ${quote.currency}).`,
        },
      });
    } else if (next === "PAID") {
      await tx.quoteEvent.create({
        data: {
          organizationId: ctx.organizationId,
          quoteId: quote.id,
          type: "PAID",
          description: `Cotización pagada en su totalidad (${total.toString()} ${quote.currency}).`,
        },
      });
    } else if (quote.status === "PARTIAL" || quote.status === "PAID") {
      await tx.quoteEvent.create({
        data: {
          organizationId: ctx.organizationId,
          quoteId: quote.id,
          type: "NOTE",
          description: `Saldo recalculado tras anulación/reembolso: ${paid.toString()} de ${total.toString()} ${quote.currency}.`,
        },
      });
    }
  }
  return next;
}

export async function registerPayment(ctx: OrganizationContext, data: RegisterPaymentData) {
  const amount = money(dec(data.amount));
  if (amount.lte(0)) {
    throw new DomainError("El monto del pago debe ser mayor a 0.");
  }

  const client = await prisma.client.findFirst({
    where: { id: data.clientId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  let linkedCaseId: string | null = data.caseId ?? null;
  let linkedServiceCaseId: string | null = null;
  if (data.caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: { id: data.caseId, organizationId: ctx.organizationId },
      select: { id: true, clientId: true, serviceCaseId: true },
    });
    if (!creditCase) throw new DomainError("El caso enlazado no existe.");
    if (creditCase.clientId !== client.id) {
      throw new DomainError("El caso no pertenece al cliente del pago.");
    }
    linkedCaseId = creditCase.id;
    linkedServiceCaseId = creditCase.serviceCaseId;
  }

  let quote: { id: string; folio: string; status: QuoteStatus; clientId: string } | null = null;
  if (data.quoteId) {
    quote = await prisma.quote.findFirst({
      where: { id: data.quoteId, organizationId: ctx.organizationId },
      select: { id: true, folio: true, status: true, clientId: true },
    });
    if (!quote) throw new DomainError("La cotización enlazada no existe.");
    if (quote.clientId !== client.id) {
      throw new DomainError("La cotización no pertenece al cliente del pago.");
    }
    if (quote.status === "CANCELLED" || quote.status === "REJECTED") {
      throw new DomainError("No se puede registrar un pago para una cotización cancelada o rechazada.");
    }
  }

  const status = data.status ?? "RECEIVED";
  if (status === "PENDING" && !data.dueAt) {
    throw new DomainError("Un pago pendiente necesita fecha de vencimiento (dueAt).");
  }

  if (status === "PENDING") {
    const payment = await prisma.payment.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        caseId: linkedCaseId,
        serviceCaseId: linkedServiceCaseId,
        quoteId: data.quoteId ?? null,
        amount,
        method: data.method,
        status: "PENDING",
        reference: data.reference ?? null,
        dueAt: data.dueAt ?? null,
        notes: data.notes ?? null,
        createdById: ctx.userId,
      },
    });
    await writeActivityLog(toActivityContext(ctx), {
      type: "PAYMENT_RECORDED",
      description: `Pago pendiente registrado por ${amount.toString()} (vence ${data.dueAt?.toISOString().slice(0, 10) ?? ""}).`,
      clientId: client.id,
      caseId: linkedCaseId,
      serviceCaseId: linkedServiceCaseId,
      metadata: { paymentId: payment.id, amount: amount.toString(), pending: true },
    });
    await syncPaymentWorkQueue(ctx, payment.id);
    return { payment, receipt: null, quoteStatus: quote?.status ?? null };
  }

  // Pago RECIBIDO: una sola transacción con todos sus efectos.
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        caseId: linkedCaseId,
        serviceCaseId: linkedServiceCaseId,
        quoteId: data.quoteId ?? null,
        amount,
        method: data.method,
        status: "RECEIVED",
        reference: data.reference ?? null,
        receivedAt: data.receivedAt ?? new Date(),
        notes: data.notes ?? null,
        createdById: ctx.userId,
      },
    });

    if (quote) {
      await tx.quoteEvent.create({
        data: {
          organizationId: ctx.organizationId,
          quoteId: quote.id,
          type: "PAYMENT_RECORDED",
          description: `Pago recibido: ${amount.toString()} (${data.method}).`,
          metadata: { paymentId: payment.id },
        },
      });
    }

    // Recibo con folio transaccional (snapshot monto/moneda/método/fecha).
    const { folio, folioNumber } = await nextReceiptFolio(tx, ctx.organizationId);
    const receipt = await tx.receipt.create({
      data: {
        organizationId: ctx.organizationId,
        paymentId: payment.id,
        clientId: client.id,
        folioNumber,
        folio,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.method,
        issuedAt: payment.receivedAt ?? new Date(),
        notes: data.notes ?? null,
      },
    });

    const quoteStatus = quote
      ? await syncQuotePaymentStatus(tx, ctx, quote.id)
      : null;

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "PAYMENT_RECORDED",
        description: `Pago recibido por ${amount.toString()} ${payment.currency} (${data.method}).`,
        clientId: client.id,
        caseId: linkedCaseId,
        serviceCaseId: linkedServiceCaseId,
        metadata: { paymentId: payment.id, amount: amount.toString(), method: data.method },
      },
      tx,
    );
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "RECEIPT_CREATED",
        description: `Recibo ${folio} emitido.`,
        clientId: client.id,
        caseId: linkedCaseId,
        serviceCaseId: linkedServiceCaseId,
        metadata: { receiptId: receipt.id, folio, paymentId: payment.id },
      },
      tx,
    );
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "PAYMENT_RECEIVED",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { amount: amount.toString(), method: data.method, quoteId: data.quoteId ?? null },
      },
      tx,
    );

    // Si el pago está ligado a una cuota de plan, márcala PAID / completa el plan.
    await syncInstallmentOnPaymentReceived(payment.id, tx);

    return { payment, receipt, quoteStatus };
  });
}

/**
 * Convierte un pago PENDING existente a RECEIVED (recibo + sync de cuota).
 * Usado para cobrar cuotas de un plan de pago.
 */
export async function receivePendingPayment(
  ctx: OrganizationContext,
  paymentId: string,
  opts?: { receivedAt?: Date | null; reference?: string | null; notes?: string | null },
) {
  const existing = await getPaymentOrThrow(ctx, paymentId);
  if (existing.status !== "PENDING") {
    throw new DomainError("Solo se pueden recibir pagos pendientes.");
  }

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.update({
      where: { id: existing.id },
      data: {
        status: "RECEIVED",
        receivedAt: opts?.receivedAt ?? new Date(),
        ...(opts?.reference !== undefined ? { reference: opts.reference } : {}),
        ...(opts?.notes !== undefined ? { notes: opts.notes } : {}),
      },
    });

    if (payment.quoteId) {
      await tx.quoteEvent.create({
        data: {
          organizationId: ctx.organizationId,
          quoteId: payment.quoteId,
          type: "PAYMENT_RECORDED",
          description: `Pago recibido: ${payment.amount.toString()} (${payment.method}).`,
          metadata: { paymentId: payment.id },
        },
      });
    }

    const { folio, folioNumber } = await nextReceiptFolio(tx, ctx.organizationId);
    const receipt = await tx.receipt.create({
      data: {
        organizationId: ctx.organizationId,
        paymentId: payment.id,
        clientId: payment.clientId,
        folioNumber,
        folio,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.method,
        issuedAt: payment.receivedAt ?? new Date(),
        notes: opts?.notes ?? payment.notes,
      },
    });

    const quoteStatus = payment.quoteId
      ? await syncQuotePaymentStatus(tx, ctx, payment.quoteId)
      : null;

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "PAYMENT_RECORDED",
        description: `Pago recibido por ${payment.amount.toString()} ${payment.currency} (${payment.method}).`,
        clientId: payment.clientId,
        caseId: payment.caseId,
        metadata: { paymentId: payment.id, amount: payment.amount.toString(), method: payment.method },
      },
      tx,
    );
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "RECEIPT_CREATED",
        description: `Recibo ${folio} emitido.`,
        clientId: payment.clientId,
        caseId: payment.caseId,
        metadata: { receiptId: receipt.id, folio, paymentId: payment.id },
      },
      tx,
    );
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "PAYMENT_RECEIVED",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          amount: payment.amount.toString(),
          method: payment.method,
          quoteId: payment.quoteId,
          fromPending: true,
        },
      },
      tx,
    );

    await syncInstallmentOnPaymentReceived(payment.id, tx);

    return { payment, receipt, quoteStatus };
  }).then(async (result) => {
    await syncPaymentWorkQueue(ctx, result.payment.id);
    return result;
  });
}

/** Solo pagos PENDING son editables. */
export async function updatePendingPayment(
  ctx: OrganizationContext,
  paymentId: string,
  data: UpdatePendingPaymentData,
) {
  const payment = await getPaymentOrThrow(ctx, paymentId);
  if (payment.status !== "PENDING") {
    throw new DomainError("Solo se pueden editar pagos pendientes.");
  }
  const amount = data.amount !== undefined ? money(dec(data.amount)) : undefined;
  if (amount !== undefined && amount.lte(0)) {
    throw new DomainError("El monto del pago debe ser mayor a 0.");
  }
  return prisma.payment.update({
    where: { id: payment.id },
    data: {
      ...(amount !== undefined ? { amount } : {}),
      ...(data.method !== undefined ? { method: data.method } : {}),
      ...(data.reference !== undefined ? { reference: data.reference } : {}),
      ...(data.dueAt !== undefined ? { dueAt: data.dueAt } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  }).then(async (updated) => {
    await syncPaymentWorkQueue(ctx, updated.id);
    return updated;
  });
}

/** Cancela un pago PENDING. Para pagos recibidos usar refundPaymentRecord. */
export async function cancelPayment(ctx: OrganizationContext, paymentId: string, reason?: string) {
  const payment = await getPaymentOrThrow(ctx, paymentId);
  if (payment.status === "RECEIVED") {
    throw new DomainError(
      "Un pago recibido no se puede cancelar directamente; registra un reembolso.",
    );
  }
  if (payment.status !== "PENDING") {
    throw new DomainError("El pago ya está cancelado o reembolsado.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: "CANCELLED" },
    });
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "PAYMENT_CANCELLED",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { amount: payment.amount.toString(), reason: reason ?? null },
      },
      tx,
    );
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STATUS_CHANGE",
        description: `Pago pendiente de ${payment.amount.toString()} cancelado.`,
        clientId: payment.clientId,
        caseId: payment.caseId,
        metadata: { paymentId: payment.id },
      },
      tx,
    );
    return updated;
  }).then(async (updated) => {
    await syncPaymentWorkQueue(ctx, updated.id);
    return updated;
  });
}

/**
 * Reembolso de un pago RECEIVED: Payment → REFUNDED, su recibo queda
 * anulado (VOID) y se recalcula el saldo de la cotización. Todo auditado.
 */
export async function refundPaymentRecord(
  ctx: OrganizationContext,
  paymentId: string,
  reason?: string,
) {
  const payment = await getPaymentOrThrow(ctx, paymentId);
  if (payment.status !== "RECEIVED") {
    throw new DomainError("Solo se puede reembolsar un pago recibido.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED" },
    });

    if (payment.receipt && payment.receipt.status === "ISSUED") {
      await tx.receipt.update({
        where: { id: payment.receipt.id },
        data: {
          status: "VOID",
          voidedAt: new Date(),
          voidReason: reason ?? "Pago reembolsado.",
        },
      });
    }

    if (payment.quoteId) {
      await syncQuotePaymentStatus(tx, ctx, payment.quoteId);
    }

    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "PAYMENT_REFUNDED",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          amount: payment.amount.toString(),
          reason: reason ?? null,
          receiptId: payment.receipt?.id ?? null,
        },
      },
      tx,
    );
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STATUS_CHANGE",
        description: `Pago de ${payment.amount.toString()} ${payment.currency} reembolsado.`,
        clientId: payment.clientId,
        caseId: payment.caseId,
        metadata: { paymentId: payment.id },
      },
      tx,
    );
    return updated;
  });
}

/** Saldo de una cotización: total, recibido, pendiente y balance. */
export async function quoteBalance(ctx: OrganizationContext, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId: ctx.organizationId },
    select: { id: true, folio: true, total: true, currency: true, status: true },
  });
  if (!quote) throw new DomainError("Cotización no encontrada.");

  const [received, pending] = await Promise.all([
    prisma.payment.aggregate({
      where: { quoteId, status: "RECEIVED" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { quoteId, status: "PENDING" },
      _sum: { amount: true },
    }),
  ]);

  const paid = money(received._sum.amount ?? new Prisma.Decimal(0));
  const pendingAmount = money(pending._sum.amount ?? new Prisma.Decimal(0));
  const total = money(quote.total);
  return {
    quoteId: quote.id,
    folio: quote.folio,
    status: quote.status,
    currency: quote.currency,
    total,
    paid,
    pending: pendingAmount,
    balance: money(total.sub(paid)),
  };
}

/**
 * PY-002 / Fase 4 — Balance a nivel expediente (ServiceCase).
 * balance = agreedAmount − Σ pagos RECEIVED del expediente.
 * Sin agreedAmount no hay balance canónico (el de Quote sigue en quoteBalance).
 */
export async function serviceCaseBalance(
  ctx: OrganizationContext,
  serviceCaseId: string,
) {
  const serviceCase = await prisma.serviceCase.findFirst({
    where: { id: serviceCaseId, organizationId: ctx.organizationId },
    select: {
      id: true,
      caseNumber: true,
      quotedAmount: true,
      agreedAmount: true,
    },
  });
  if (!serviceCase) throw new DomainError("Expediente no encontrado.");

  const [received, pending] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        organizationId: ctx.organizationId,
        serviceCaseId: serviceCase.id,
        status: "RECEIVED",
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        organizationId: ctx.organizationId,
        serviceCaseId: serviceCase.id,
        status: "PENDING",
      },
      _sum: { amount: true },
    }),
  ]);

  const paid = money(received._sum.amount ?? new Prisma.Decimal(0));
  const pendingAmount = money(pending._sum.amount ?? new Prisma.Decimal(0));
  const agreed = serviceCase.agreedAmount
    ? money(serviceCase.agreedAmount)
    : null;
  return {
    serviceCaseId: serviceCase.id,
    caseNumber: serviceCase.caseNumber,
    currency: "USD",
    quotedAmount: serviceCase.quotedAmount
      ? money(serviceCase.quotedAmount)
      : null,
    agreedAmount: agreed,
    paid,
    pending: pendingAmount,
    balance: agreed ? money(agreed.sub(paid)) : null,
  };
}

/** Suma de pagos pendientes (PENDING) de la organización, para el tablero de /pagos. */
export async function sumPendingPayments(ctx: OrganizationContext) {
  const agg = await prisma.payment.aggregate({
    where: { organizationId: ctx.organizationId, status: "PENDING" },
    _sum: { amount: true },
  });
  return money(agg._sum.amount ?? new Prisma.Decimal(0));
}

export async function listPayments(ctx: OrganizationContext, filters: PaymentListFilters = {}) {
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Prisma.PaymentWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.method ? { method: filters.method } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.caseId ? { caseId: filters.caseId } : {}),
    ...(filters.quoteId ? { quoteId: filters.quoteId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.payment.findMany({
    where,
    select: PAYMENT_LIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function getPaymentDetail(ctx: OrganizationContext, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, organizationId: ctx.organizationId },
    include: {
      client: {
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
      case: { select: { id: true, caseCode: true } },
      quote: { select: { id: true, folio: true, total: true, status: true } },
      receipt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!payment) throw new DomainError("Pago no encontrado.");
  return payment;
}
