/**
 * Generadores de PDF en servidor con jsPDF.
 * Reciben datos ya cargados (sin acceso a BD) y devuelven Buffer.
 * Diseño sobrio: encabezado con nombre legal, tabla de ítems y totales.
 */
import { jsPDF } from "jspdf";

export interface PdfOrganizationInfo {
  legalName: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  addressLine?: string | null;
}

const MARGIN = 20;
const PAGE_WIDTH = 210; // A4 mm
const PAGE_HEIGHT = 297; // A4 mm
/** Y máximo usable antes de forzar salto (deja margen inferior). */
const PAGE_BOTTOM = PAGE_HEIGHT - MARGIN;

/**
 * Si no cabe `neededMm` en la página actual, añade página y reinicia Y.
 * JH-006 / TEST-005.
 */
function ensureSpace(
  doc: jsPDF,
  y: number,
  neededMm: number,
): number {
  if (y + neededMm <= PAGE_BOTTOM) return y;
  doc.addPage();
  return MARGIN;
}

function startDocument(org: PdfOrganizationInfo, title: string, folio: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: `${title} ${folio}`, creator: org.legalName });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(org.legalName, MARGIN, MARGIN);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  let y = MARGIN + 6;
  const contact = [org.addressLine, org.phone, org.email, org.website]
    .filter(Boolean)
    .join("  ·  ");
  if (contact) {
    doc.text(doc.splitTextToSize(contact, PAGE_WIDTH - MARGIN * 2), MARGIN, y);
    y += 5;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(title.toUpperCase(), PAGE_WIDTH - MARGIN, MARGIN, { align: "right" });
  doc.setFontSize(10);
  doc.text(folio, PAGE_WIDTH - MARGIN, MARGIN + 6, { align: "right" });

  doc.setDrawColor(200);
  doc.line(MARGIN, MARGIN + 12, PAGE_WIDTH - MARGIN, MARGIN + 12);

  return { doc, yStart: MARGIN + 22 };
}

function toBuffer(doc: jsPDF): Buffer {
  return Buffer.from(doc.output("arraybuffer"));
}

export {
  toBuffer,
  startDocument,
  ensureSpace,
  MARGIN,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  PAGE_BOTTOM,
};
