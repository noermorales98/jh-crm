import { startDocument, toBuffer, MARGIN, PAGE_WIDTH } from "./base";
import type { PdfOrganizationInfo } from "./base";
import { formatForPdf } from "../format/dates";
import type { AvanceViewData } from "@/src/server/avance/view";

export function generateAvancePdf(
  data: AvanceViewData,
  org: PdfOrganizationInfo,
  timezone?: string,
): Buffer {
  const { doc, yStart } = startDocument(
    org,
    "Avance",
    data.clientName.slice(0, 28),
  );
  let y = yStart + 2;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  const para = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(40);
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.5 + 3;
  };

  const row = (label: string, value: string) => {
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(label, MARGIN, y);
    doc.setTextColor(0);
    doc.text(value, PAGE_WIDTH - MARGIN, y, { align: "right" });
    y += 6;
  };

  para(`Avance mensual de ${data.clientName}`);
  para(`${data.organizationName}`);
  para(
    [
      data.roundLabel,
      data.reportDate ? formatForPdf(data.reportDate, timezone) : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  para(data.verdict);

  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text("Puntajes", MARGIN, y);
  y += 7;
  for (const b of data.bureaus) {
    row(b.bureau, b.score != null ? `${b.score} (${b.label})` : "—");
  }

  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Qué hay que limpiar", MARGIN, y);
  y += 7;
  row("Negativos", String(data.cleanup.negativeTotal));
  row("Charge-offs", String(data.cleanup.chargeOffs));
  row("Pagos tardíos", String(data.cleanup.late));
  row("Consultas", String(data.cleanup.inquiries));
  row("Datos personales", String(data.cleanup.personal));

  return toBuffer(doc);
}
