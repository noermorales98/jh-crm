import {
  Prisma,
  type PaymentInstallmentStatus,
  type PaymentPlanFrequency,
  type PaymentPlanStatus,
} from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";

const dec = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const money = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface CreatePaymentPlanData {
  clientId: string;
  caseId?: string | null;
  quoteId?: string | null;
  totalAmount: Prisma.Decimal | number | string;
  numberOfInstallments: number;
  frequency: PaymentPlanFrequency;
  startDate: Date;
  notes?: string | null;
}

export interface PaymentPlanListFilters {
  status?: PaymentPlanStatus;
  clientId?: string;
  cursor?: string;
  limit?: number;
}

/** Fecha de vencimiento de la cuota `index` (0-based) según frecuencia. */
export function addInstallmentDate(
  start: Date,
  frequency: PaymentPlanFrequency,
  index: number,
): Date {
  const d = new Date(start.getTime());
  if (index <= 0) return d;

  switch (frequency) {
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() + 7 * index);
      return d;
    case "BIWEEKLY":
      d.setUTCDate(d.getUTCDate() + 14 * index);
      return d;
    case "MONTHLY":
    case "CUSTOM": {
      const day = d.getUTCDate();
      d.setUTCMonth(d.getUTCMonth() + index);
      // Evitar desbordes (p. ej. 31 → feb).
      if (d.getUTCDate() < day) {
        d.setUTCDate(0);
      }
      return d;
    }
    default:
      d.setUTCMonth(d.getUTCMonth() + index);
      return d;
  }
}

async function getPlanOrThrow(ctx: OrganizationContext, planId: string) {
  const plan = await prisma.paymentPlan.findFirst({
    where: { id: planId, organizationId: ctx.organizationId },
  });
  if (!plan) throw new DomainError("Plan de pago no encontrado.");
  return plan;
}

/**
 * Tras marcar un Payment como RECEIVED: si hay cuota ligada → PAID;
 * si todas las cuotas del plan están PAID → plan COMPLETED.
 */
export async function syncInstallmentOnPaymentReceived(
  paymentId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  const installment = await tx.paymentInstallment.findFirst({
    where: { paymentId },
  });
  if (!installment) return null;
  if (installment.status === "PAID" || installment.status === "CANCELLED") {
    return installment;
  }

  const updated = await tx.paymentInstallment.update({
    where: { id: installment.id },
    data: { status: "PAID" },
  });

  const remaining = await tx.paymentInstallment.count({
    where: {
      planId: installment.planId,
      status: { notIn: ["PAID", "CANCELLED"] },
    },
  });
  if (remaining === 0) {
    await tx.paymentPlan.update({
      where: { id: installment.planId },
      data: { status: "COMPLETED" },
    });
  }
  return updated;
}

export async function createPaymentPlan(
  ctx: OrganizationContext,
  data: CreatePaymentPlanData,
) {
  const totalAmount = money(dec(data.totalAmount));
  if (totalAmount.lte(0)) {
    throw new DomainError("El monto total debe ser mayor a 0.");
  }
  const n = data.numberOfInstallments;
  if (n < 2 || n > 60) {
    throw new DomainError("El número de cuotas debe estar entre 2 y 60.");
  }

  const client = await prisma.client.findFirst({
    where: { id: data.clientId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  if (data.caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: { id: data.caseId, organizationId: ctx.organizationId },
      select: { id: true, clientId: true },
    });
    if (!creditCase) throw new DomainError("El caso enlazado no existe.");
    if (creditCase.clientId !== client.id) {
      throw new DomainError("El caso no pertenece al cliente del plan.");
    }
  }

  if (data.quoteId) {
    const quote = await prisma.quote.findFirst({
      where: { id: data.quoteId, organizationId: ctx.organizationId },
      select: { id: true, clientId: true },
    });
    if (!quote) throw new DomainError("La cotización enlazada no existe.");
    if (quote.clientId !== client.id) {
      throw new DomainError("La cotización no pertenece al cliente del plan.");
    }
  }

  const baseInstallment = money(totalAmount.div(n));
  const lastInstallment = money(
    totalAmount.sub(baseInstallment.mul(n - 1)),
  );

  return prisma.$transaction(async (tx) => {
    const plan = await tx.paymentPlan.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        caseId: data.caseId ?? null,
        quoteId: data.quoteId ?? null,
        totalAmount,
        installmentAmount: baseInstallment,
        frequency: data.frequency,
        numberOfInstallments: n,
        startDate: data.startDate,
        notes: data.notes?.trim() || null,
        createdById: ctx.userId,
        status: "ACTIVE",
      },
    });

    for (let i = 0; i < n; i += 1) {
      const sequence = i + 1;
      const amount = i === n - 1 ? lastInstallment : baseInstallment;
      const dueAt = addInstallmentDate(data.startDate, data.frequency, i);

      const payment = await tx.payment.create({
        data: {
          organizationId: ctx.organizationId,
          clientId: client.id,
          caseId: data.caseId ?? null,
          quoteId: data.quoteId ?? null,
          amount,
          method: "OTHER",
          status: "PENDING",
          dueAt,
          notes: `Cuota ${sequence}/${n} plan`,
          createdById: ctx.userId,
        },
      });

      await tx.paymentInstallment.create({
        data: {
          organizationId: ctx.organizationId,
          planId: plan.id,
          sequence,
          amount,
          dueAt,
          status: "PENDING",
          paymentId: payment.id,
        },
      });
    }

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "PAYMENT_PLAN_CREATED",
        description: `Plan de pago creado: ${n} cuotas por ${totalAmount.toString()} USD.`,
        clientId: client.id,
        caseId: data.caseId ?? null,
        metadata: {
          planId: plan.id,
          numberOfInstallments: n,
          frequency: data.frequency,
          totalAmount: totalAmount.toString(),
        },
      },
      tx,
    );

    return tx.paymentPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: {
        installments: { orderBy: { sequence: "asc" } },
        client: {
          select: { id: true, clientCode: true, firstName: true, lastName: true },
        },
      },
    });
  });
}

export async function listPaymentPlans(
  ctx: OrganizationContext,
  filters: PaymentPlanListFilters = {},
) {
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Prisma.PaymentPlanWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
  };

  const rows = await prisma.paymentPlan.findMany({
    where,
    include: {
      client: {
        select: { id: true, clientCode: true, firstName: true, lastName: true },
      },
      _count: { select: { installments: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function getPaymentPlan(ctx: OrganizationContext, planId: string) {
  const plan = await prisma.paymentPlan.findFirst({
    where: { id: planId, organizationId: ctx.organizationId },
    include: {
      client: {
        select: { id: true, clientCode: true, firstName: true, lastName: true },
      },
      case: { select: { id: true, caseCode: true } },
      quote: { select: { id: true, folio: true } },
      createdBy: { select: { id: true, name: true } },
      installments: {
        orderBy: { sequence: "asc" },
        include: {
          payment: {
            select: {
              id: true,
              status: true,
              method: true,
              receivedAt: true,
              reference: true,
            },
          },
        },
      },
    },
  });
  if (!plan) throw new DomainError("Plan de pago no encontrado.");
  return plan;
}

export async function cancelPaymentPlan(
  ctx: OrganizationContext,
  planId: string,
  reason?: string,
) {
  const plan = await getPlanOrThrow(ctx, planId);
  if (plan.status === "CANCELLED") {
    throw new DomainError("El plan ya está cancelado.");
  }
  if (plan.status === "COMPLETED") {
    throw new DomainError("No se puede cancelar un plan completado.");
  }

  return prisma.$transaction(async (tx) => {
    const pendingInstallments = await tx.paymentInstallment.findMany({
      where: {
        planId: plan.id,
        status: { in: ["PENDING", "OVERDUE"] satisfies PaymentInstallmentStatus[] },
      },
    });

    for (const inst of pendingInstallments) {
      await tx.paymentInstallment.update({
        where: { id: inst.id },
        data: { status: "CANCELLED" },
      });
      if (inst.paymentId) {
        const payment = await tx.payment.findFirst({
          where: {
            id: inst.paymentId,
            organizationId: ctx.organizationId,
            status: "PENDING",
          },
        });
        if (payment) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "CANCELLED" },
          });
        }
      }
    }

    const updated = await tx.paymentPlan.update({
      where: { id: plan.id },
      data: { status: "CANCELLED" },
    });

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "STATUS_CHANGE",
        description: `Plan de pago cancelado${reason ? `: ${reason}` : "."}`,
        clientId: plan.clientId,
        caseId: plan.caseId,
        metadata: { planId: plan.id, reason: reason ?? null },
      },
      tx,
    );

    return updated;
  });
}

/** Marca cuotas PENDING vencidas como OVERDUE (cron). */
export async function markOverdueInstallments(now = new Date()) {
  const result = await prisma.paymentInstallment.updateMany({
    where: {
      status: "PENDING",
      dueAt: { lt: now },
    },
    data: { status: "OVERDUE" },
  });
  return result.count;
}
