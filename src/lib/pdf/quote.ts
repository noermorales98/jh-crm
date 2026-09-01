import { startDocument, toBuffer, MARGIN, PAGE_WIDTH } from "./base";
import { formatMoney } from "../format/money";
import { formatForPdf } from "../format/dates";
import type { PdfOrganizationInfo } from "./base";

export interface QuotePdfItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  total: number;
}

export interface QuotePdfData {
  organization: PdfOrganizationInfo;
  folio: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  issuedAt: Date;
  validUntil?: Date | null;
  currency?: string;
  items: QuotePdfItem[];
  subtotal: number;
  discountTotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string | null;
  terms?: string | null;
  timezone?: string;
}

export function generateQuotePdf(data: QuotePdfData): Buffer {
  const currency = data.currency ?? "USD";
  const money = (n: number) => formatMoney(n, currency);
  const { doc, yStart } = startDocument(data.organization, "Cotización", data.folio);
  let y = yStart;

  // Cliente y fechas
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("CLIENTE", MARGIN, y);
  doc.text("FECHA", PAGE_WIDTH / 2 + 20, y);
  y += 5;
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(data.clientName, MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    formatForPdf(data.issuedAt, data.timezone),
    PAGE_WIDTH / 2 + 20,
    y,
  );
  y += 5;
  const clientContact = [data.clientEmail, data.clientPhone].filter(Boolean).join("  ·  ");
  if (clientContact) {
    doc.setFontSize(9);
    doc.text(clientContact, MARGIN, y);
    y += 4;
  }
  if (data.validUntil) {
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(
      `Válida hasta: ${formatForPdf(data.validUntil, data.timezone)}`,
      PAGE_WIDTH / 2 + 20,
      y,
    );
    doc.setTextColor(0);
  }
  y += 8;

  // Encabezado de tabla
  const col = {
    description: MARGIN,
    qty: 120,
    unit: 140,
    discount: 162,
    total: PAGE_WIDTH - MARGIN,
  };
  doc.setFillColor(245, 246, 248);
  doc.rect(MARGIN, y - 4, PAGE_WIDTH - MARGIN * 2, 7, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(70);
  doc.text("DESCRIPCIÓN", col.description + 1, y);
  doc.text("CANT.", col.qty, y, { align: "right" });
  doc.text("P. UNITARIO", col.unit + 8, y, { align: "right" });
  doc.text("DESCUENTO", col.discount + 8, y, { align: "right" });
  doc.text("TOTAL", col.total, y, { align: "right" });
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  doc.setFontSize(9);
  for (const item of data.items) {
    const lines = doc.splitTextToSize(item.description, 105) as string[];
    if (y > 265) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(lines, col.description + 1, y);
    doc.text(String(item.quantity), col.qty, y, { align: "right" });
    doc.text(money(item.unitPrice), col.unit + 8, y, { align: "right" });
    doc.text(money(item.discountAmount), col.discount + 8, y, { align: "right" });
    doc.text(money(item.total), col.total, y, { align: "right" });
    y += Math.max(lines.length * 4, 5) + 2;
  }

  // Totales
  y += 4;
  doc.setDrawColor(200);
  doc.line(120, y, PAGE_WIDTH - MARGIN, y);
  y += 6;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9);
    doc.text(label, col.unit, y, { align: "right" });
    doc.text(value, col.total, y, { align: "right" });
    y += 6;
  };
  totalRow("Subtotal", money(data.subtotal));
  if (data.discountTotal > 0) totalRow("Descuento", `-${money(data.discountTotal)}`);
  if (data.taxAmount > 0) totalRow(`Impuesto (${data.taxRate}%)`, money(data.taxAmount));
  totalRow("TOTAL", money(data.total), true);

  // Notas y términos
  if (data.notes) {
    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text("NOTAS", MARGIN, y);
    y += 4;
    doc.setTextColor(0);
    doc.text(doc.splitTextToSize(data.notes, PAGE_WIDTH - MARGIN * 2), MARGIN, y);
    y += 10;
  }
  if (data.terms) {
    y += 2;
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text("TÉRMINOS", MARGIN, y);
    y += 4;
    doc.setTextColor(0);
    doc.text(doc.splitTextToSize(data.terms, PAGE_WIDTH - MARGIN * 2), MARGIN, y);
  }

  return toBuffer(doc);
}
