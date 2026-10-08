import { startDocument, toBuffer, MARGIN, PAGE_WIDTH } from "./base";
import type { PdfOrganizationInfo } from "./base";
import { formatForPdf } from "../format/dates";

export type ActionPlanPdfData = {
  organization: PdfOrganizationInfo;
  clientName: string;
  reportDate: Date;
  timezone?: string;
  qualified: boolean;
  bureausApproved: number;
  verdict: string;
  avgScore: number | null;
  avgUtilization: number | null;
  bureaus: {
    bureau: string;
    score: number | null;
    utilization: number | null;
    inquiries: number | null;
  }[];
  revolving: {
    openCards: number;
    auCards: number;
    totalLimit: number;
    utilPct: number | null;
  };
  priorities: {
    title: string;
    severity: string;
    summary: string;
    ficoImpact: string;
    timeline: string;
  }[];
};

/**
 * PDF del Plan de Acción (contenido alineado a la UI interactiva).
 */
export function generateActionPlanPdf(data: ActionPlanPdfData): Buffer {
  const { doc, yStart } = startDocument(
    data.organization,
    "Plan de Acción",
    data.clientName.slice(0, 28),
  );
  let y = yStart + 2;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  const ensureSpace = (need: number) => {
    if (y + need > 280) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const section = (title: string) => {
    ensureSpace(14);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(title, MARGIN, y);
    y += 7;
  };

  const para = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(40);
    const lines = doc.splitTextToSize(text, contentWidth);
    ensureSpace(lines.length * 4.5 + 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.5 + 3;
  };

  const row = (label: string, value: string) => {
    ensureSpace(7);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    doc.text(label, MARGIN, y);
    doc.setTextColor(0);
    doc.text(value, PAGE_WIDTH - MARGIN, y, { align: "right" });
    y += 6;
  };

  para(`Cliente: ${data.clientName}`);
  para(`Reporte: ${formatForPdf(data.reportDate, data.timezone)}`);
  para(
    data.qualified
      ? "Perfil con señales de elegibilidad"
      : "No calificado actualmente",
  );
  para(`${data.bureausApproved} de 3 bureaus aprobados`);

  section("1. Desglose por buró");
  for (const b of data.bureaus) {
    row(
      b.bureau,
      [
        b.score != null ? String(b.score) : "—",
        b.utilization != null ? `util ${Math.round(b.utilization)}%` : null,
        b.inquiries != null ? `${b.inquiries} inq` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  section("2. Crédito rotativo");
  row("Tarjetas abiertas", String(data.revolving.openCards));
  row("Cuentas AU", String(data.revolving.auCards));
  row(
    "Límite total",
    `$${Math.round(data.revolving.totalLimit).toLocaleString("en-US")}`,
  );
  row(
    "Utilización",
    data.revolving.utilPct != null
      ? `${data.revolving.utilPct.toFixed(1)}%`
      : "—",
  );

  section("3. Veredicto");
  para(data.verdict);
  row("Score promedio", data.avgScore != null ? String(data.avgScore) : "—");
  row(
    "Util. promedio",
    data.avgUtilization != null ? `${data.avgUtilization}%` : "—",
  );

  section("4. Prioridades del plan");
  data.priorities.forEach((p, i) => {
    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Prioridad ${i + 1} · ${p.severity}`, MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const titleLines = doc.splitTextToSize(p.title, contentWidth);
    doc.text(titleLines, MARGIN, y);
    y += titleLines.length * 4.5 + 2;
    para(p.summary);
    para(`${p.ficoImpact} · ${p.timeline}`);
  });

  return toBuffer(doc);
}
