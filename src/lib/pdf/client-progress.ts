import { startDocument, toBuffer, MARGIN, PAGE_WIDTH } from "./base";
import type { PdfOrganizationInfo } from "./base";
import { formatForPdf } from "../format/dates";

export interface ProgressReportPdfData {
  organization: PdfOrganizationInfo;
  clientName: string;
  caseCode: string;
  periodLabel: string;
  roundLabel: string;
  reportDate: Date;
  scores: { bureau: string; score: number | null; delta: number | null }[];
  results: {
    deleted: number;
    updated: number;
    pending: number;
    verified?: number;
  };
  resultLines: string[];
  nextReviewAt?: Date | null;
  nextSteps?: string | null;
  timezone?: string;
}

/**
 * Reporte visual para el cliente — sin SSN, notas internas ni secretos.
 */
export function generateClientProgressPdf(data: ProgressReportPdfData): Buffer {
  const { doc, yStart } = startDocument(
    data.organization,
    "Reporte de progreso",
    data.caseCode,
  );
  let y = yStart + 2;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  /** Etiqueta arriba, valor abajo — evita texto derecho estirado/desbordado. */
  const field = (label: string, value: string) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 4.5;
    doc.setTextColor(0);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(value, contentWidth);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 3;
  };

  /** Fila compacta etiqueta | valor (valores cortos: puntajes, conteos). */
  const row = (label: string, value: string) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text(label.toUpperCase(), MARGIN, y);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(value, PAGE_WIDTH - MARGIN, y, { align: "right" });
    y += 7;
  };

  field("Cliente", data.clientName);
  field("Periodo", data.periodLabel);
  field("Ronda", data.roundLabel);
  field("Fecha", formatForPdf(data.reportDate, data.timezone));

  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text("Puntajes", MARGIN, y);
  y += 8;

  for (const s of data.scores) {
    const delta =
      s.delta == null ? "" : s.delta > 0 ? ` (+${s.delta})` : ` (${s.delta})`;
    row(s.bureau, s.score != null ? `${s.score}${delta}` : "—");
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text("Resultados", MARGIN, y);
  y += 8;
  row("Eliminados", String(data.results.deleted));
  row("Actualizados", String(data.results.updated));
  if (data.results.verified != null) {
    row("Verificados", String(data.results.verified));
  }
  row("Pendientes", String(data.results.pending));

  if (data.resultLines.length) {
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Detalle resumido", MARGIN, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const line of data.resultLines.slice(0, 12)) {
      if (y > 270) {
        doc.addPage();
        y = MARGIN;
      }
      const wrapped = doc.splitTextToSize(`• ${line}`, contentWidth);
      doc.text(wrapped, MARGIN, y);
      y += wrapped.length * 4.5 + 1;
    }
  }

  y += 4;
  if (data.nextReviewAt) {
    field("Próxima revisión", formatForPdf(data.nextReviewAt, data.timezone));
  }
  if (data.nextSteps) {
    y += 2;
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text("PRÓXIMOS PASOS", MARGIN, y);
    y += 5;
    doc.setTextColor(0);
    doc.setFontSize(10);
    const steps = doc.splitTextToSize(data.nextSteps, contentWidth);
    doc.text(steps, MARGIN, y);
    y += steps.length * 5;
  }

  y += 14;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Este resumen es informativo. Los resultados dependen de las respuestas de los burós y no garantizan un puntaje específico.",
    MARGIN,
    Math.min(y, 285),
    { maxWidth: contentWidth },
  );

  return toBuffer(doc);
}
