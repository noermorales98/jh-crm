/**
 * PDF del Análisis de cuentas negativas: el mismo contenido que el panel
 * (una tarjeta por deuda, qué reporta cada buró, motivos y lo que dijo el
 * cliente). Dibujado con jsPDF en el servidor, con los colores de buró del
 * Plan de Acción.
 */
import { jsPDF } from "jspdf";
import { metricText, presentAmount } from "@/src/lib/credit/metrics-view";
import { CLIENT_ANSWER_LABELS, hasStrongReason } from "@/src/lib/credit/negative-review";
import type { NegativeReview } from "@/src/server/credit-reports/negative-review";
import { logoBoxMm } from "./logo";
import { toBuffer, PAGE_WIDTH, PAGE_HEIGHT } from "./base";
import type { PdfOrganizationInfo } from "./base";
import { formatForPdf } from "../format/dates";

export type NegativeReviewPdfData = {
  organization: PdfOrganizationInfo;
  review: NegativeReview;
  bureauLabels: Record<string, string>;
  negativeTypeLabels: Record<string, string>;
};

type RGB = [number, number, number];

const M = 14;
const W = PAGE_WIDTH - M * 2;
const BOTTOM = PAGE_HEIGHT - 16;

const INK: RGB = [28, 28, 30];
const MUTED: RGB = [95, 95, 102];
const LINE: RGB = [222, 222, 228];
const DANGER: { soft: RGB; ink: RGB } = { soft: [251, 232, 234], ink: [190, 18, 40] };
const WARNING: { soft: RGB; ink: RGB } = { soft: [248, 239, 230], ink: [160, 72, 0] };
const NEUTRAL: { soft: RGB; ink: RGB } = { soft: [241, 241, 244], ink: [60, 60, 67] };
const BUREAU_RGB: Record<string, RGB> = {
  EQUIFAX: [200, 54, 79],
  EXPERIAN: [47, 91, 211],
  TRANSUNION: [11, 143, 138],
};

function money(amount: number | null): string {
  return metricText(presentAmount({ amount, currency: null, status: amount == null ? "UNKNOWN" : "KNOWN" }));
}

export function generateNegativeReviewPdf(data: NegativeReviewPdfData): Buffer {
  const { review } = data;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({
    title: `Cuentas negativas ${review.clientName}`,
    creator: data.organization.legalName,
  });
  let y = M;

  const color = (rgb: RGB, kind: "text" | "fill" | "draw") => {
    if (kind === "text") doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    else if (kind === "fill") doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    else doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  };
  const font = (size: number, weight: "normal" | "bold" = "normal", rgb: RGB = INK) => {
    doc.setFont("helvetica", weight);
    doc.setFontSize(size);
    color(rgb, "text");
  };
  const wrap = (text: string, width: number) => doc.splitTextToSize(text, width) as string[];
  const ensure = (need: number) => {
    if (y + need > BOTTOM) {
      doc.addPage();
      y = M;
    }
  };
  const label = (key: string) => data.bureauLabels[key] ?? key;
  const chip = (text: string, x: number, cy: number, tone: { soft: RGB; ink: RGB }): number => {
    font(7, "bold", tone.ink);
    const w = doc.getTextWidth(text) + 5;
    color(tone.soft, "fill");
    doc.roundedRect(x, cy - 3.4, w, 5, 2.5, 2.5, "F");
    doc.text(text, x + 2.5, cy);
    return w;
  };
  const heading = (title: string) => {
    ensure(16);
    y += 3;
    font(11, "bold", INK);
    doc.text(title, M, y);
    y += 2;
    color(LINE, "draw");
    doc.line(M, y, M + W, y);
    y += 5;
  };

  // Encabezado
  if (data.organization.logo?.dataUrl) {
    try {
      const box = logoBoxMm(data.organization.logo);
      doc.addImage(
        data.organization.logo.dataUrl,
        data.organization.logo.format,
        PAGE_WIDTH / 2 - box.widthMm / 2,
        y,
        box.widthMm,
        box.heightMm,
      );
      y += box.heightMm + 4;
    } catch {
      // Sin logo si viene corrupto.
    }
  }
  font(17, "bold", INK);
  doc.text("Análisis de cuentas negativas", PAGE_WIDTH / 2, y + 4, { align: "center" });
  y += 10;
  font(8, "bold", MUTED);
  doc.text(data.organization.legalName.toUpperCase(), PAGE_WIDTH / 2, y, { align: "center" });
  y += 5;
  font(9.5, "normal", INK);
  doc.text(`Cliente: ${review.clientName}`, PAGE_WIDTH / 2, y, { align: "center" });
  y += 4.5;
  font(7.5, "normal", MUTED);
  doc.text(`Reporte del ${formatForPdf(review.reportDate, "UTC")}`, PAGE_WIDTH / 2, y, { align: "center" });
  y += 8;

  // Resumen
  const totalBalance = review.debts.reduce((sum, d) => sum + (d.balance ?? 0), 0);
  const strong = review.debts.filter(hasStrongReason).length;
  const kpis: { label: string; value: string; ink: RGB }[] = [
    { label: "Deudas negativas", value: String(review.debts.length), ink: DANGER.ink },
    { label: "Saldo reportado", value: money(totalBalance), ink: INK },
    { label: "Con motivo concreto", value: String(strong), ink: strong > 0 ? WARNING.ink : INK },
    { label: "Consultas duras", value: String(review.inquiries.length), ink: INK },
  ];
  const gap = 2.5;
  const kw = (W - gap * (kpis.length - 1)) / kpis.length;
  kpis.forEach((kpi, i) => {
    const x = M + i * (kw + gap);
    color(LINE, "draw");
    doc.roundedRect(x, y, kw, 14, 1.8, 1.8, "S");
    font(6.4, "bold", MUTED);
    doc.text(kpi.label.toUpperCase(), x + 2.5, y + 4.2, { maxWidth: kw - 5 });
    font(12, "bold", kpi.ink);
    doc.text(kpi.value, x + 2.5, y + 10.5, { maxWidth: kw - 5 });
  });
  y += 18;

  // Deudas
  heading("Deudas por revisar");
  review.debts.forEach((debt, index) => {
    const reasonLines = debt.reasons.map((r) => ({ title: r.title, lines: wrap(r.detail, W - 12) }));
    const interview = debt.interview.answer
      ? `${CLIENT_ANSWER_LABELS[debt.interview.answer]}${debt.interview.words ? `: "${debt.interview.words}"` : ""}`
      : "Sin entrevista";
    const interviewLines = wrap(`Cliente: ${interview}`, W - 8);
    const height =
      12 +
      debt.rows.length * 5 +
      4 +
      reasonLines.reduce((sum, r) => sum + 4 + r.lines.length * 3.4, 0) +
      interviewLines.length * 3.6 +
      6;
    ensure(height);
    const top = y;

    // Título
    y = top + 6;
    font(10, "bold", INK);
    const title = `${index + 1}. ${debt.creditorName}${debt.last4 ? ` ****${debt.last4}` : ""}`;
    doc.text(title, M + 4, y);
    font(10, "bold", INK);
    doc.text(money(debt.balance), M + W - 4, y, { align: "right" });
    let cx = M + 4 + doc.getTextWidth(title) + 3;
    cx += chip(data.negativeTypeLabels[debt.type] ?? debt.type, cx, y, DANGER) + 2;
    if (debt.inOpenRound) chip("En ronda abierta", cx, y, NEUTRAL);
    y += 5;

    // Filas por buró
    for (const row of debt.rows) {
      color(BUREAU_RGB[row.bureau] ?? MUTED, "fill");
      doc.circle(M + 5.5, y - 1, 1, "F");
      font(7.8, "bold", INK);
      doc.text(label(row.bureau), M + 8, y);
      font(7.8, "normal", MUTED);
      doc.text(row.status ?? "Estado sin dato", M + 32, y, { maxWidth: 80 });
      doc.text(row.dateOpened ? `Abierta ${formatForPdf(row.dateOpened, "UTC")}` : "Apertura sin dato", M + 118, y);
      font(7.8, "bold", INK);
      doc.text(money(row.balance), M + W - 4, y, { align: "right" });
      y += 5;
    }
    y += 1;

    // Motivos
    for (const reason of reasonLines) {
      const strongReason = reason.title !== "Solicitar verificación";
      chip(reason.title, M + 4, y + 1, strongReason ? WARNING : NEUTRAL);
      y += 4.6;
      font(7.5, "normal", MUTED);
      doc.text(reason.lines, M + 6, y);
      y += reason.lines.length * 3.4 + 0.4;
    }

    // Entrevista
    font(7.5, debt.interview.answer ? "bold" : "normal", debt.interview.answer ? INK : MUTED);
    doc.text(interviewLines, M + 4, y + 1.5);
    y += interviewLines.length * 3.6 + 2;
    color(LINE, "draw");
    doc.roundedRect(M, top, W, y - top, 2, 2, "S");
    y += 3;
  });

  // Consultas duras
  if (review.inquiries.length > 0) {
    heading(`Consultas duras (${review.inquiries.length})`);
    font(7.5, "normal", MUTED);
    const intro = wrap(
      "Bajan el puntaje un poco y pesan si son muchas. Se disputan por carta aparte solo las que el cliente no reconoce.",
      W,
    );
    doc.text(intro, M, y);
    y += intro.length * 3.4 + 2;
    for (const inquiry of review.inquiries) {
      ensure(6);
      color(BUREAU_RGB[inquiry.bureau] ?? MUTED, "fill");
      doc.circle(M + 1.5, y - 1, 1, "F");
      font(8, "normal", INK);
      doc.text(inquiry.creditorName, M + 4, y);
      font(8, "normal", MUTED);
      doc.text(
        `${label(inquiry.bureau)} · ${inquiry.inquiryDate ? formatForPdf(inquiry.inquiryDate, "UTC") : "sin fecha"}`,
        M + W,
        y,
        { align: "right" },
      );
      y += 5;
    }
  }

  // Aviso legal
  ensure(16);
  y += 4;
  font(7, "normal", MUTED);
  const legal = wrap(
    "Herramienta para ejercer los derechos de disputa bajo la FCRA. No es asesoría legal ni garantiza la eliminación de registros; la decisión final es del buró tras su reinvestigación. Solo se disputa lo que el cliente considera inexacto o no puede verificarse. Los datos exactos y verificables pueden permanecer hasta 7 años desde la primera morosidad.",
    W,
  );
  doc.text(legal, M, y);

  // Pie de página
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font(7, "normal", MUTED);
    doc.text(`${data.organization.legalName} · ${review.clientName}`, M, PAGE_HEIGHT - 8);
    doc.text(`Página ${p} de ${pages}`, PAGE_WIDTH - M, PAGE_HEIGHT - 8, { align: "right" });
  }

  return toBuffer(doc);
}
