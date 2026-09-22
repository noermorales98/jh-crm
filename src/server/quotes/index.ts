import { Prisma, type QuoteStatus } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { nextQuoteFolio } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";

/**
 * Cotizaciones. Los ítems guardan SNAPSHOT de descripción/precio del
 * catálogo: cambios posteriores en Service/ServicePackage no alteran
 * cotizaciones históricas. Todos los cálculos de dinero con Decimal.
 */

export type QuoteItemKind = "service" | "package" | "manual";

export interface QuoteItemInput {
  kind: QuoteItemKind;
  serviceId?: string;
  packageId?: string;
  /** Obligatoria para ítems manuales; opcional (override) para catálogo. */
  description?: string;
  quantity: Prisma.Decimal | number | string;
  /** Override de precio; si falta se usa el default del catálogo. */
  unitPrice?: Prisma.Decimal | number | string;
  discountAmount?: Prisma.Decimal | number | string;
}

export interface QuoteCreateData {
  clientId: string;
  caseId?: string | null;
  items: QuoteItemInput[];
  validUntil?: Date | null;
  notes?: string | null;
  terms?: string | null;
  /** Si falta, se usa defaultTaxRate de OrganizationSettings. */
  taxRate?: Prisma.Decimal | number | string;
}

export interface QuoteListFilters {
  status?: QuoteStatus;
  clientId?: string;
  caseId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

const QUOTE_LIST_SELECT = {
  id: true,
  folio: true,
  folioNumber: true,
  status: true,
  currency: true,
  issuedAt: true,
  validUntil: true,
  subtotal: true,
  discountTotal: true,
  taxRate: true,
  taxAmount: true,
  total: true,
  sentAt: true,
  acceptedAt: true,
  paidAt: true,
  client: { select: { id: true, clientCode: true, firstName: true, lastName: true } },
  case: { select: { id: true, caseCode: true } },
} satisfies Prisma.QuoteSelect;

const dec = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const money = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

interface ComputedItem {
  serviceId: string | null;
  packageId: string | null;
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  order: number;
}

async function resolveItems(
  ctx: OrganizationContext,
  items: QuoteItemInput[],
): Promise<ComputedItem[]> {
  if (items.length === 0) {
    throw new DomainError("La cotización debe tener al menos un ítem.");
  }
  if (items.length > 100) {
    throw new DomainError("La cotización no puede tener más de 100 ítems.");
  }

  const resolved: ComputedItem[] = [];
  for (const [index, item] of items.entries()) {
    const quantity = money(dec(item.quantity));
    if (quantity.lte(0)) {
      throw new DomainError(`El ítem ${index + 1} debe tener cantidad mayor a 0.`);
    }

    let description = item.description?.trim() ?? "";
    let unitPrice: Prisma.Decimal | null =
      item.unitPrice !== undefined ? dec(item.unitPrice) : null;
    let serviceId: string | null = null;
    let packageId: string | null = null;

    if (item.kind === "service") {
      if (!item.serviceId) throw new DomainError(`El ítem ${index + 1} no tiene servicio.`);
      const service = await prisma.service.findFirst({
        where: { id: item.serviceId, organizationId: ctx.organizationId, isActive: true },
      });
      if (!service) {
        throw new DomainError(`El servicio del ítem ${index + 1} no existe o está archivado.`);
      }
      serviceId = service.id;
      if (!description) description = service.name;
      unitPrice = unitPrice ?? service.defaultPrice;
    } else if (item.kind === "package") {
      if (!item.packageId) throw new DomainError(`El ítem ${index + 1} no tiene paquete.`);
      const pkg = await prisma.servicePackage.findFirst({
        where: { id: item.packageId, organizationId: ctx.organizationId, isActive: true },
      });
      if (!pkg) {
        throw new DomainError(`El paquete del ítem ${index + 1} no existe o está archivado.`);
      }
      packageId = pkg.id;
      if (!description) description = pkg.name;
      unitPrice = unitPrice ?? pkg.defaultPrice;
    } else if (!description) {
      throw new DomainError(`El ítem manual ${index + 1} necesita una descripción.`);
    }

    const price = money(unitPrice ?? new Prisma.Decimal(0));
    if (price.lt(0)) {
      throw new DomainError(`El ítem ${index + 1} tiene precio negativo.`);
    }
    const discount = money(dec(item.discountAmount ?? 0));
    const gross = money(quantity.mul(price));
    if (discount.gt(gross)) {
      throw new DomainError(
        `El descuento del ítem ${index + 1} no puede ser mayor que su importe.`,
      );
    }

    resolved.push({
      serviceId,
      packageId,
      description,
      quantity,
      unitPrice: price,
      discountAmount: discount,
      total: money(gross.sub(discount)),
      order: index,
    });
  }
  return resolved;
}

interface QuoteTotals {
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
}

function computeTotals(items: ComputedItem[], taxRate: Prisma.Decimal): QuoteTotals {
  const subtotal = items.reduce((acc, item) => acc.add(item.quantity.mul(item.unitPrice)), new Prisma.Decimal(0));
  const discountTotal = items.reduce((acc, item) => acc.add(item.discountAmount), new Prisma.Decimal(0));
  const taxable = subtotal.sub(discountTotal);
  const taxAmount = money(taxable.mul(taxRate).div(100));
  return {
    subtotal: money(subtotal),
    discountTotal: money(discountTotal),
    taxRate,
    taxAmount,
    total: money(taxable.add(taxAmount)),
  };
}

async function getQuoteOrThrow(ctx: OrganizationContext, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId: ctx.organizationId },
    include: { client: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!quote) throw new DomainError("Cotización no encontrada.");
  return quote;
}

async function addQuoteEvent(
  tx: Prisma.TransactionClient,
  quoteId: string,
  organizationId: string,
  type: "CREATED" | "EDITED" | "SENT" | "ACCEPTED" | "REJECTED" | "PAYMENT_RECORDED" | "PARTIALLY_PAID" | "PAID" | "EXPIRED" | "CANCELLED" | "NOTE",
  description?: string,
  metadata?: Record<string, unknown>,
) {
  await tx.quoteEvent.create({
    data: {
      organizationId,
      quoteId,
      type,
      description: description ?? null,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function createQuote(ctx: OrganizationContext, data: QuoteCreateData) {
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, organizationId: ctx.organizationId },
    select: { id: true, status: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");

  let linkedServiceCaseId: string | null = null;
  if (data.caseId) {
    const creditCase = await prisma.creditCase.findFirst({
      where: { id: data.caseId, organizationId: ctx.organizationId },
      select: { id: true, clientId: true, serviceCaseId: true },
    });
    if (!creditCase) throw new DomainError("El caso enlazado no existe.");
    if (creditCase.clientId !== client.id) {
      throw new DomainError("El caso no pertenece al cliente de la cotización.");
    }
    linkedServiceCaseId = creditCase.serviceCaseId;
  }

  const items = await resolveItems(ctx, data.items);

  const settings = await prisma.organizationSettings.findUniqueOrThrow({
    where: { organizationId: ctx.organizationId },
    select: { defaultTaxRate: true, defaultTerms: true, currency: true },
  });
  const taxRate = data.taxRate !== undefined ? dec(data.taxRate) : settings.defaultTaxRate;
  if (taxRate.lt(0) || taxRate.gt(100)) {
    throw new DomainError("La tasa de impuesto debe estar entre 0 y 100.");
  }
  const totals = computeTotals(items, taxRate);

  return prisma.$transaction(async (tx) => {
    const { folio, folioNumber } = await nextQuoteFolio(tx, ctx.organizationId);
    const quote = await tx.quote.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        caseId: data.caseId ?? null,
        serviceCaseId: linkedServiceCaseId,
        folioNumber,
        folio,
        currency: settings.currency ?? "USD",
        validUntil: data.validUntil ?? null,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes: data.notes ?? null,
        terms: data.terms ?? settings.defaultTerms ?? null,
        createdById: ctx.userId,
        items: {
          create: items.map((item) => ({
            serviceId: item.serviceId,
            packageId: item.packageId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            total: item.total,
            order: item.order,
          })),
        },
      },
      include: { items: { orderBy: { order: "asc" } } },
    });

    await addQuoteEvent(tx, quote.id, ctx.organizationId, "CREATED", `Cotización ${folio} creada.`);
    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "QUOTE_CREATED",
        description: `Cotización ${folio} creada por ${totals.total.toString()} ${quote.currency}.`,
        clientId: client.id,
        caseId: data.caseId ?? null,
        serviceCaseId: linkedServiceCaseId,
        metadata: { quoteId: quote.id, folio, total: totals.total.toString() },
      },
      tx,
    );

    return quote;
  });
}

/** Solo cotizaciones en DRAFT son editables: reemplaza ítems y recalcula. */
export async function updateQuote(
  ctx: OrganizationContext,
  quoteId: string,
  data: Partial<Omit<QuoteCreateData, "clientId" | "caseId">>,
) {
  const quote = await getQuoteOrThrow(ctx, quoteId);
  if (quote.status !== "DRAFT") {
    throw new DomainError("Solo se pueden editar cotizaciones en borrador.");
  }

  const items = data.items ? await resolveItems(ctx, data.items) : null;
  const taxRate = data.taxRate !== undefined ? dec(data.taxRate) : quote.taxRate;
  if (taxRate.lt(0) || taxRate.gt(100)) {
    throw new DomainError("La tasa de impuesto debe estar entre 0 y 100.");
  }

  return prisma.$transaction(async (tx) => {
    let totals: QuoteTotals | null = null;
    if (items || data.taxRate !== undefined) {
      const effectiveItems =
        items ??
        (
          await tx.quoteItem.findMany({
            where: { quoteId: quote.id },
            orderBy: { order: "asc" },
          })
        ).map((item) => ({
          serviceId: item.serviceId,
          packageId: item.packageId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          total: item.total,
          order: item.order,
        }));
      totals = computeTotals(effectiveItems, taxRate);
    }

    if (items) {
      await tx.quoteItem.deleteMany({ where: { quoteId: quote.id } });
      await tx.quoteItem.createMany({
        data: items.map((item) => ({
          quoteId: quote.id,
          serviceId: item.serviceId,
          packageId: item.packageId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          total: item.total,
          order: item.order,
        })),
      });
    }

    const updated = await tx.quote.update({
      where: { id: quote.id },
      data: {
        ...(data.validUntil !== undefined ? { validUntil: data.validUntil } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.terms !== undefined ? { terms: data.terms } : {}),
        ...(totals
          ? {
              subtotal: totals.subtotal,
              discountTotal: totals.discountTotal,
              taxRate: totals.taxRate,
              taxAmount: totals.taxAmount,
              total: totals.total,
            }
          : {}),
      },
      include: { items: { orderBy: { order: "asc" } } },
    });

    await addQuoteEvent(tx, quote.id, ctx.organizationId, "EDITED", `Cotización ${quote.folio} editada.`);
    return updated;
  });
}

async function transitionQuote(
  ctx: OrganizationContext,
  quoteId: string,
  allowedFrom: QuoteStatus[],
  to: QuoteStatus,
  eventType: "SENT" | "ACCEPTED" | "REJECTED" | "CANCELLED",
  errorMessage: string,
  extraData: Prisma.QuoteUpdateInput = {},
) {
  const quote = await getQuoteOrThrow(ctx, quoteId);
  if (!allowedFrom.includes(quote.status)) {
    throw new DomainError(errorMessage);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.quote.update({
      where: { id: quote.id },
      data: { status: to, ...extraData },
    });
    await addQuoteEvent(
      tx,
      quote.id,
      ctx.organizationId,
      eventType,
      `Cotización ${quote.folio}: ${to}.`,
    );
    if (eventType === "SENT") {
      await writeActivityLog(
        toActivityContext(ctx),
        {
          type: "QUOTE_SENT",
          description: `Cotización ${quote.folio} enviada al cliente.`,
          clientId: quote.clientId,
          caseId: quote.caseId,
          metadata: { quoteId: quote.id, folio: quote.folio },
        },
        tx,
      );
    }
    return updated;
  });
}

export async function markQuoteSent(ctx: OrganizationContext, quoteId: string) {
  const updated = await transitionQuote(
    ctx,
    quoteId,
    ["DRAFT"],
    "SENT",
    "SENT",
    "Solo se puede enviar una cotización en borrador.",
    { sentAt: new Date() },
  );
  await import("@/src/server/notifications/client-emails")
    .then((m) => m.notifyClientQuoteSent(ctx.organizationId, quoteId))
    .catch((error) => {
      console.error(
        "[quotes] correo cliente no enviado:",
        error instanceof Error ? error.message : "error",
      );
    });
  await import("@/src/server/notifications/client-whatsapp")
    .then((m) => m.notifyClientQuoteSentWhatsapp(ctx.organizationId, quoteId))
    .catch((error) => {
      console.error(
        "[quotes] WhatsApp cliente no enviado:",
        error instanceof Error ? error.message : "error",
      );
    });
  return updated;
}

export function markQuoteAccepted(ctx: OrganizationContext, quoteId: string) {
  return transitionQuote(ctx, quoteId, ["DRAFT", "SENT"], "ACCEPTED", "ACCEPTED", "Solo se puede aceptar una cotización en borrador o enviada.", { acceptedAt: new Date() });
}

export function markQuoteRejected(ctx: OrganizationContext, quoteId: string) {
  return transitionQuote(ctx, quoteId, ["SENT"], "REJECTED", "REJECTED", "Solo se puede rechazar una cotización enviada.");
}

export function cancelQuote(ctx: OrganizationContext, quoteId: string) {
  return transitionQuote(
    ctx,
    quoteId,
    ["DRAFT", "SENT", "ACCEPTED", "PARTIAL"],
    "CANCELLED",
    "CANCELLED",
    "No se puede cancelar una cotización pagada o ya cancelada.",
  );
}

export async function getQuoteDetail(ctx: OrganizationContext, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId: ctx.organizationId },
    include: {
      client: { select: { id: true, clientCode: true, firstName: true, lastName: true, email: true, phone: true } },
      case: { select: { id: true, caseCode: true } },
      items: { orderBy: { order: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!quote) throw new DomainError("Cotización no encontrada.");
  return quote;
}

export async function listQuotes(ctx: OrganizationContext, filters: QuoteListFilters = {}) {
  const limit = Math.min(filters.limit ?? 20, 100);
  const where: Prisma.QuoteWhereInput = {
    organizationId: ctx.organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.clientId ? { clientId: filters.clientId } : {}),
    ...(filters.caseId ? { caseId: filters.caseId } : {}),
    ...(filters.from || filters.to
      ? {
          issuedAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.quote.findMany({
    where,
    select: QUOTE_LIST_SELECT,
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
