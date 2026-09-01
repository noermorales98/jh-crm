import { startDocument, toBuffer, MARGIN, PAGE_WIDTH } from "./base";
import { formatMoney } from "../format/money";
import { formatForPdf } from "../format/dates";
import type { PdfOrganizationInfo } from "./base";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ZELLE: "Zelle",
  STRIPE: "Tarjeta (Stripe)",
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia bancaria",
  OTHER: "Otro",
};

export interface ReceiptPdfData {
  organization: PdfOrganizationInfo;
  folio: string;
  clientName: string;
  amount: number;
  currency?: string;
  paymentMethod: string;
  reference?: string | null;
  issuedAt: Date;
  concept?: string | null;
  notes?: string | null;
  timezone?: string;
}

export function generateReceiptPdf(data: ReceiptPdfData): Buffer {
  const currency = data.currency ?? "USD";
  const { doc, yStart } = startDocument(data.organization, "Recibo de pago", data.folio);
  let y = yStart + 4;

  const row = (label: string, value: string, boldValue = false) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text(label.toUpperCase(), MARGIN, y);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.setFont("helvetica", boldValue ? "bold" : "normal");
    doc.text(value, PAGE_WIDTH - MARGIN, y, { align: "right" });
    y += 8;
  };

  row("Folio", data.folio);
  row("Fecha", formatForPdf(data.issuedAt, data.timezone));
  row("Recibido de", data.clientName);
  if (data.concept) row("Concepto", data.concept);
  row("Método de pago", PAYMENT_METHOD_LABELS[data.paymentMethod] ?? data.paymentMethod);
  if (data.reference) row("Referencia", data.reference);

  y += 6;
  doc.setDrawColor(200);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 10;

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  doc.text("MONTO RECIBIDO", MARGIN, y);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(formatMoney(data.amount, currency), PAGE_WIDTH - MARGIN, y, {
    align: "right",
  });
  y += 14;

  if (data.notes) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text("NOTAS", MARGIN, y);
    y += 4;
    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(data.notes, PAGE_WIDTH - MARGIN * 2), MARGIN, y);
  }

  return toBuffer(doc);
}
