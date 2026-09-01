import { NextResponse } from "next/server";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import { generateReceiptPdf } from "@/src/lib/pdf/receipt";
import type { PdfOrganizationInfo } from "@/src/lib/pdf/base";

/** GET /api/receipts/[receiptId]/pdf — PDF del recibo emitido. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  try {
    const ctx = await requireApiPermission("receipts.view");
    const { receiptId } = await params;

    const receipt = await prisma.receipt.findFirst({
      where: { id: receiptId, organizationId: ctx.organizationId },
      include: {
        client: { select: { firstName: true, lastName: true } },
        payment: {
          select: {
            reference: true,
            quote: { select: { folio: true } },
            case: { select: { caseCode: true } },
          },
        },
      },
    });
    if (!receipt) throw new DomainError("Recibo no encontrado.");

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: ctx.organizationId },
    });
    if (!settings) throw new DomainError("Configuración de la organización no encontrada.");

    const addressLine = [
      settings.addressLine1,
      settings.addressLine2,
      [settings.city, settings.state, settings.postalCode].filter(Boolean).join(", "),
    ]
      .filter(Boolean)
      .join(", ");
    const org: PdfOrganizationInfo = {
      legalName: settings.legalName,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      addressLine: addressLine || null,
    };

    const concept = receipt.payment.quote
      ? `Pago de cotización ${receipt.payment.quote.folio}`
      : receipt.payment.case
        ? `Pago del caso ${receipt.payment.case.caseCode}`
        : null;

    const pdf = generateReceiptPdf({
      organization: org,
      folio: receipt.folio,
      clientName: `${receipt.client.firstName} ${receipt.client.lastName ?? ""}`.trim(),
      amount: Number(receipt.amount),
      currency: receipt.currency,
      paymentMethod: receipt.paymentMethod,
      reference: receipt.payment.reference,
      issuedAt: receipt.issuedAt,
      concept,
      notes: receipt.notes,
      timezone: settings.timezone,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${receipt.folio}.pdf"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
