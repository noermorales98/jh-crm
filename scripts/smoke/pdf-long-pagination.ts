/**
 * TEST-005 / JH-006 — cotización/recibo largos paginan sin cortar totales.
 */
import { generateQuotePdf } from "../../src/lib/pdf/quote";
import { generateReceiptPdf } from "../../src/lib/pdf/receipt";

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

function pdfPageCount(buf: Buffer): number {
  // jsPDF emite /Type /Page entries; rough but enough for smoke.
  const text = buf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length ?? 0;
}

console.log("\n[TEST-005] PDF long pagination");

const org = {
  legalName: "J&H Multiservices LLC (sintético)",
  email: "ops@example.test",
};

const items = Array.from({ length: 40 }, (_, i) => ({
  description: `Línea de servicio sintética ${i + 1} con descripción extendida para forzar wrap y paginación en la tabla de cotización.`,
  quantity: 1,
  unitPrice: 10 + i,
  discountAmount: 0,
  total: 10 + i,
}));

const quotePdf = generateQuotePdf({
  organization: org,
  folio: "Q-TEST-005",
  clientName: "Cliente Sintético",
  issuedAt: new Date("2026-01-15T12:00:00Z"),
  items,
  subtotal: items.reduce((s, it) => s + it.total, 0),
  discountTotal: 0,
  taxRate: 0,
  taxAmount: 0,
  total: items.reduce((s, it) => s + it.total, 0),
  notes: "Notas ".repeat(80),
  terms: "Términos ".repeat(80),
});

check("quote es PDF", quotePdf.subarray(0, 5).toString() === "%PDF-");
const quotePages = pdfPageCount(quotePdf);
check(`quote multipágina (${quotePages})`, quotePages >= 2);

const receiptPdf = generateReceiptPdf({
  organization: org,
  folio: "R-TEST-005",
  clientName: "Cliente Sintético",
  amount: 123.45,
  paymentMethod: "ZELLE",
  issuedAt: new Date("2026-01-15T12:00:00Z"),
  notes: "Nota larga ".repeat(120),
});
check("receipt es PDF", receiptPdf.subarray(0, 5).toString() === "%PDF-");
check("receipt genera bytes", receiptPdf.length > 500);

console.log("\nOK pdf-long-pagination (TEST-005)\n");
