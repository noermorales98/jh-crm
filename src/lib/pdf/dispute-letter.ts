import { startDocument, toBuffer, MARGIN, PAGE_WIDTH } from "./base";
import type { PdfOrganizationInfo } from "./base";
import { formatForPdf } from "../format/dates";

export interface DisputeLetterPdfData {
  organization: PdfOrganizationInfo;
  folio: string;
  subject: string;
  recipient: string;
  body: string;
  issuedAt: Date;
  timezone?: string;
}

/** PDF de carta de disputa a partir del contenido ya revisado por un humano. */
export function generateDisputeLetterPdf(data: DisputeLetterPdfData): Buffer {
  const { doc, yStart } = startDocument(
    data.organization,
    "Carta de disputa",
    data.folio,
  );
  let y = yStart + 2;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  doc.text(`Fecha: ${formatForPdf(data.issuedAt, data.timezone)}`, MARGIN, y);
  y += 6;
  doc.text(`Destinatario: ${data.recipient}`, MARGIN, y);
  y += 6;
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text(`Asunto: ${data.subject}`, MARGIN, y);
  y += 8;

  doc.setDrawColor(220);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(data.body, PAGE_WIDTH - MARGIN * 2);
  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(line, MARGIN, y);
    y += 5;
  }

  y += 10;
  if (y > 270) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Documento generado para revisión interna. No constituye asesoría legal.",
    MARGIN,
    y,
  );

  return toBuffer(doc);
}
