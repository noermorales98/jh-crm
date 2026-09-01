import { NextResponse } from "next/server";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import { generateQuotePdf } from "@/src/lib/pdf/quote";
import type { PdfOrganizationInfo } from "@/src/lib/pdf/base";

async function loadOrgInfo(organizationId: string): Promise<{
  info: PdfOrganizationInfo;
  timezone: string;
}> {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  if (!settings) throw new DomainError("Configuración de la organización no encontrada.");
  const addressLine = [
    settings.addressLine1,
    settings.addressLine2,
    [settings.city, settings.state, settings.postalCode].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
  return {
    info: {
      legalName: settings.legalName,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      addressLine: addressLine || null,
    },
    timezone: settings.timezone,
  };
}

/** GET /api/quotes/[quoteId]/pdf — PDF de cotización generado en servidor. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  try {
    const ctx = await requireApiPermission("quotes.view");
    const { quoteId } = await params;

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, organizationId: ctx.organizationId },
      include: {
        client: { select: { firstName: true, lastName: true, email: true, phone: true } },
        items: { orderBy: { order: "asc" } },
      },
    });
    if (!quote) throw new DomainError("Cotización no encontrada.");

    const { info, timezone } = await loadOrgInfo(ctx.organizationId);
    const pdf = generateQuotePdf({
      organization: info,
      folio: quote.folio,
      clientName: `${quote.client.firstName} ${quote.client.lastName ?? ""}`.trim(),
      clientEmail: quote.client.email,
      clientPhone: quote.client.phone,
      issuedAt: quote.issuedAt,
      validUntil: quote.validUntil,
      currency: quote.currency,
      items: quote.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountAmount: Number(item.discountAmount),
        total: Number(item.total),
      })),
      subtotal: Number(quote.subtotal),
      discountTotal: Number(quote.discountTotal),
      taxRate: Number(quote.taxRate),
      taxAmount: Number(quote.taxAmount),
      total: Number(quote.total),
      notes: quote.notes,
      terms: quote.terms,
      timezone,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${quote.folio}.pdf"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
