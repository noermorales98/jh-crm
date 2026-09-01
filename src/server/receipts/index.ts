import type { Prisma, ReceiptStatus } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeAuditLog } from "@/src/server/audit";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toAuditContext } from "@/src/server/context";

/**
 * Recibos emitidos. Anular, nunca borrar: VOID + voidReason + voidedAt
 * (solo OWNER/ADMIN, validado en la capa de acciones/handlers).
 */

export interface ReceiptListFilters {
  status?: ReceiptStatus;
  clientId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

const RECEIPT_LIST_SELECT = {
  id: true,
  folio: true,
  folioNumber: true,
  status: true,
  amount: true,
  currency: true,
  paymentMethod: true,
  issuedAt: true,
  voidedAt: true,
  voidReason: true,
  client: { select: { id: true, clientCode: true, firstName: true, lastName: true } },
  payment: { select: { id: true, reference: true, status: true } },
} satisfies Prisma.ReceiptSelect;

export async function listReceipts(ctx: OrganizationContext, filters: ReceiptListFilters = {}) {
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Prisma.ReceiptWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.from || filters.to
      ? {
          issuedAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.receipt.findMany({
    where,
    select: RECEIPT_LIST_SELECT,
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function getReceipt(ctx: OrganizationContext, receiptId: string) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, organizationId: ctx.organizationId },
    include: {
      client: { select: { id: true, clientCode: true, firstName: true, lastName: true, email: true, phone: true } },
      payment: {
        select: {
          id: true,
          reference: true,
          status: true,
          notes: true,
          case: { select: { id: true, caseCode: true } },
          quote: { select: { id: true, folio: true } },
        },
      },
    },
  });
  if (!receipt) throw new DomainError("Recibo no encontrado.");
  return receipt;
}

export async function voidReceipt(
  ctx: OrganizationContext,
  receiptId: string,
  voidReason: string,
) {
  if (!voidReason.trim()) {
    throw new DomainError("Debes indicar el motivo de la anulación.");
  }
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, organizationId: ctx.organizationId },
  });
  if (!receipt) throw new DomainError("Recibo no encontrado.");
  if (receipt.status === "VOID") {
    throw new DomainError("El recibo ya está anulado.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.receipt.update({
      where: { id: receipt.id },
      data: { status: "VOID", voidedAt: new Date(), voidReason: voidReason.trim() },
    });
    await writeAuditLog(
      toAuditContext(ctx),
      {
        action: "RECEIPT_VOIDED",
        entityType: "Receipt",
        entityId: receipt.id,
        metadata: { folio: receipt.folio, voidReason: voidReason.trim() },
      },
      tx,
    );
    return updated;
  });
}
