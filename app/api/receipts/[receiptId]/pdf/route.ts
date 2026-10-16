import { NextResponse } from "next/server";
import { requireApiPermission } from "@/src/server/auth/guards";
import { apiErrorResponse } from "@/src/server/http";
import { DomainError } from "@/src/server/errors";
import { prisma } from "@/src/lib/db";
import { generateReceiptPdf } from "@/src/lib/pdf/receipt";
import { loadPdfOrganization } from "@/src/server/pdf/org-info";

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

    const { info, timezone } = await loadPdfOrganization(ctx.organizationId, {
      requireSettings: true,
    });

    const concept = receipt.payment.quote
      ? `Pago de cotización ${receipt.payment.quote.folio}`
      : receipt.payment.case
        ? `Pago del caso ${receipt.payment.case.caseCode}`
        : null;

    const pdf = generateReceiptPdf({
      organization: info,
      folio: receipt.folio,
      clientName: `${receipt.client.firstName} ${receipt.client.lastName ?? ""}`.trim(),
      amount: Number(receipt.amount),
      currency: receipt.currency,
      paymentMethod: receipt.paymentMethod,
      reference: receipt.payment.reference,
      issuedAt: receipt.issuedAt,
      concept,
      notes: receipt.notes,
      timezone,
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
