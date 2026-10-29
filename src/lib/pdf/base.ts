/**
 * Generadores de PDF en servidor con jsPDF.
 * Reciben datos ya cargados (sin acceso a BD) y devuelven Buffer.
 * Diseño sobrio: encabezado con logo opcional + nombre legal, tabla de ítems y totales.
 */
import { jsPDF } from "jspdf";
import { logoBoxMm, type PdfLogo } from "./logo";

export interface PdfOrganizationInfo {
  legalName: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  addressLine?: string | null;
  /** Pre-fetched logo (see fetchLogoForPdf). */
  logo?: PdfLogo | null;
  /** Solo para documentos al cliente (cotizaciones), no cartas a burós. */
  whatsappNumber?: string | null;
  bookingUrl?: string | null;
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

  let textX = MARGIN;
  let logoBottom = MARGIN;

  if (org.logo?.dataUrl) {
    const box = logoBoxMm(org.logo);
    try {
      doc.addImage(
        org.logo.dataUrl,
        org.logo.format,
        MARGIN,
        MARGIN - 4,
        box.widthMm,
        box.heightMm,
      );
      textX = MARGIN + box.widthMm + 4;
      logoBottom = MARGIN - 4 + box.heightMm;
    } catch {
      // Logo corrupt → fall back to text-only header.
      textX = MARGIN;
      logoBottom = MARGIN;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(org.legalName, textX, MARGIN);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  let y = MARGIN + 6;
  const contact = [org.addressLine, org.phone, org.email, org.website]
    .filter(Boolean)
    .join("  ·  ");
  if (contact) {
    const contactWidth = PAGE_WIDTH - textX - MARGIN - 55;
    doc.text(doc.splitTextToSize(contact, Math.max(40, contactWidth)), textX, y);
    y += 5;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(title.toUpperCase(), PAGE_WIDTH - MARGIN, MARGIN, { align: "right" });
  doc.setFontSize(10);
  doc.text(folio, PAGE_WIDTH - MARGIN, MARGIN + 6, { align: "right" });

  const ruleY = Math.max(MARGIN + 12, logoBottom + 3, y + 2);
  doc.setDrawColor(200);
  doc.line(MARGIN, ruleY, PAGE_WIDTH - MARGIN, ruleY);

  return { doc, yStart: ruleY + 10 };
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
