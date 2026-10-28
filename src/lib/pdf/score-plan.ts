/**
 * PDF del Score Plan: utilización de hoy, plan de pago por tarjeta hacia la
 * meta y consejos. Mismo contenido que el panel; sin predicción de puntos.
 */
import { jsPDF } from "jspdf";
import {
  BAND_HINT,
  BAND_LABEL,
  bandFor,
  payToTarget,
  totals,
  type UtilBand,
} from "@/src/lib/credit/utilization-plan";
import type { ScorePlanData } from "@/src/server/credit-reports/score-plan";
import { logoBoxMm } from "./logo";
import { toBuffer, PAGE_WIDTH, PAGE_HEIGHT } from "./base";
import type { PdfOrganizationInfo } from "./base";
import { formatForPdf } from "../format/dates";

export type ScorePlanPdfData = {
  organization: PdfOrganizationInfo;
  data: ScorePlanData;
  targetPct: number;
};

type RGB = [number, number, number];

const M = 14;
const W = PAGE_WIDTH - M * 2;
const BOTTOM = PAGE_HEIGHT - 16;
const INK: RGB = [28, 28, 30];
const MUTED: RGB = [95, 95, 102];
const LINE: RGB = [222, 222, 228];
const TRACK: RGB = [236, 236, 240];
const ACCENT: RGB = [10, 91, 215];
const BAND_RGB: Record<UtilBand, RGB> = {
  NONE: [95, 95, 102],
  IDEAL: [29, 122, 50],
  OK: [10, 91, 215],
  HIGH: [178, 80, 0],
  VERY_HIGH: [190, 18, 40],
};

function usd(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

function pct(bps: number | null): string {
  return bps == null ? "Sin dato" : `${Math.round(bps / 100)}%`;
}

export function generateScorePlanPdf(input: ScorePlanPdfData): Buffer {
  const { data, targetPct } = input;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title: `Score Plan ${data.clientName}`, creator: input.organization.legalName });
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
  const heading = (title: string) => {
    ensure(18);
    y += 4;
    font(11, "bold", INK);
    doc.text(title, M, y);
    y += 2;
    color(LINE, "draw");
    doc.line(M, y, M + W, y);
    y += 6;
  };
  /** Barra 0–100% con marcas de 10% y 30%. */
  const gauge = (x: number, top: number, width: number, bps: number | null, rgb: RGB, h = 3) => {
    color(TRACK, "fill");
    doc.roundedRect(x, top, width, h, h / 2, h / 2, "F");
    if (bps != null && bps > 0) {
      color(rgb, "fill");
      doc.roundedRect(x, top, Math.max(width * Math.min(bps / 10000, 1), h), h, h / 2, h / 2, "F");
    }
  };

  // Encabezado
  if (input.organization.logo?.dataUrl) {
    try {
      const box = logoBoxMm(input.organization.logo);
      doc.addImage(
        input.organization.logo.dataUrl,
        input.organization.logo.format,
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
  doc.text("Score Plan", PAGE_WIDTH / 2, y + 4, { align: "center" });
  y += 9;
  font(9, "normal", MUTED);
  doc.text("Baja el uso de tus tarjetas para subir el puntaje, aparte de la reparación", PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 5;
  font(8, "bold", MUTED);
  doc.text(input.organization.legalName.toUpperCase(), PAGE_WIDTH / 2, y, { align: "center" });
  y += 5;
  font(9.5, "normal", INK);
  doc.text(`Cliente: ${data.clientName}`, PAGE_WIDTH / 2, y, { align: "center" });
  y += 4.5;
  font(7.5, "normal", MUTED);
  doc.text(`Reporte del ${formatForPdf(data.reportDate, "UTC")}`, PAGE_WIDTH / 2, y, { align: "center" });
  y += 8;

  const now = totals(data.cards);
  const band = bandFor(now.utilizationBps);
  const plan = payToTarget(data.cards, targetPct);
  const afterBand = bandFor(plan.afterBps);

  // Hoy
  color(LINE, "draw");
  doc.roundedRect(M, y, W, 34, 2, 2, "S");
  font(7, "bold", MUTED);
  doc.text("TU UTILIZACIÓN HOY", M + 5, y + 6);
  font(26, "bold", band ? BAND_RGB[band] : INK);
  doc.text(pct(now.utilizationBps), M + 5, y + 17);
  font(9, "bold", band ? BAND_RGB[band] : INK);
  doc.text(band ? BAND_LABEL[band] : "Sin dato", M + 38, y + 12);
  font(8, "normal", MUTED);
  doc.text(`Usas ${usd(now.balance)} de ${usd(now.limit)} en ${data.cards.length} tarjetas abiertas`, M + 38, y + 17);
  const gx = M + 5;
  const gw = W - 10;
  gauge(gx, y + 22, gw, now.utilizationBps, band ? BAND_RGB[band] : ACCENT, 3.5);
  for (const mark of [10, 30]) {
    const mx = gx + (gw * mark) / 100;
    color(MUTED, "draw");
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(mx, y + 20.5, mx, y + 27);
    doc.setLineDashPattern([], 0);
    font(6.5, "normal", MUTED);
    doc.text(mark === 10 ? "10% ideal" : "30% límite", mx, y + 30.5, { align: "center" });
  }
  y += 39;
  if (band) {
    font(8, "normal", MUTED);
    doc.text(wrap(BAND_HINT[band], W), M, y);
    y += 6;
  }

  // Plan de pago
  heading(`1. Paga en este orden (meta: menos de ${targetPct + 1}%)`);
  if (plan.rows.length === 0) {
    font(8.5, "normal", INK);
    doc.text("Todas las tarjetas ya están en la meta. Mantén los saldos así.", M, y);
    y += 6;
  } else {
    const cols = { name: M + 2, limit: M + 74, now: M + 98, pay: M + 140, after: M + W - 2 };
    font(7, "bold", MUTED);
    doc.text("TARJETA", cols.name, y);
    doc.text("LÍMITE", cols.limit, y, { align: "right" });
    doc.text("USO HOY", cols.now, y);
    doc.text("PAGA", cols.pay, y, { align: "right" });
    doc.text("QUEDA EN", cols.after, y, { align: "right" });
    y += 3;
    color(LINE, "draw");
    doc.line(M, y, M + W, y);
    y += 5;
    plan.rows.forEach((row, index) => {
      ensure(9);
      const rowBand = bandFor(row.nowBps);
      font(8.5, "bold", INK);
      doc.text(`${index + 1}. ${row.creditorName}`, cols.name, y, { maxWidth: 66 });
      font(8.5, "normal", MUTED);
      doc.text(usd(row.limit), cols.limit, y, { align: "right" });
      gauge(cols.now, y - 2.4, 22, row.nowBps, rowBand ? BAND_RGB[rowBand] : ACCENT, 2.2);
      font(8, "bold", rowBand ? BAND_RGB[rowBand] : INK);
      doc.text(pct(row.nowBps), cols.now + 25, y);
      font(9, "bold", ACCENT);
      doc.text(usd(row.payment), cols.pay, y, { align: "right" });
      font(8.5, "normal", INK);
      doc.text(pct(row.afterBps), cols.after, y, { align: "right" });
      y += 7;
    });
    color(LINE, "draw");
    doc.line(M, y - 3, M + W, y - 3);
    font(9, "bold", INK);
    doc.text("Total a pagar", cols.name, y + 1);
    font(10, "bold", ACCENT);
    doc.text(usd(plan.totalPayment), cols.pay, y + 1, { align: "right" });
    font(8.5, "bold", afterBand ? BAND_RGB[afterBand] : INK);
    doc.text(`${pct(plan.afterBps)}${afterBand ? ` · ${BAND_LABEL[afterBand]}` : ""}`, cols.after, y + 1, {
      align: "right",
    });
    y += 7;
  }
  if (plan.alreadyIdeal.length > 0) {
    font(7.5, "normal", MUTED);
    doc.text(
      wrap(`Ya están bien (menos de 10%): ${plan.alreadyIdeal.map((r) => `${r.creditorName} (${pct(r.nowBps)})`).join(" · ")}`, W),
      M,
      y,
    );
    y += 6;
  }

  // Consejos
  heading("2. Cómo hacerlo para que cuente");
  const tips = [
    ["Paga antes de la fecha de corte.", "El banco reporta el saldo del estado de cuenta, no el del día que pagas. Paga unos días antes del corte de cada tarjeta."],
    ["Deja un saldo pequeño en una tarjeta.", "Entre 1% y 9% en una sola; todas en $0 puede verse como crédito sin uso."],
    ["No cierres tarjetas viejas.", "Al cerrar pierdes límite (sube el porcentaje) y, con el tiempo, antigüedad."],
    ["Espera el reporte del banco.", "El cambio aparece cuando cada banco reporta a los burós, normalmente en 30 a 45 días."],
  ];
  for (const [title, body] of tips) {
    const lines = wrap(body, W - 8);
    ensure(lines.length * 3.6 + 7);
    color(ACCENT, "fill");
    doc.circle(M + 1.5, y - 1.2, 0.9, "F");
    font(8.5, "bold", INK);
    doc.text(title, M + 5, y);
    y += 4;
    font(8, "normal", MUTED);
    doc.text(lines, M + 5, y);
    y += lines.length * 3.6 + 2.5;
  }
  if (/myfreescorenow/i.test(data.provider ?? "")) {
    font(7.5, "normal", MUTED);
    const lines = wrap(
      "Este reporte (MyFreeScoreNow) da la fecha de reporte por mes, no por día; la fecha de corte exacta está en el estado de cuenta de cada tarjeta.",
      W,
    );
    ensure(lines.length * 3.4 + 2);
    doc.text(lines, M, y);
    y += lines.length * 3.4 + 2;
  }

  // Aviso
  ensure(14);
  y += 4;
  font(7, "normal", MUTED);
  doc.text(
    wrap(
      "Estimación con los saldos y límites del reporte importado. No es una garantía de puntaje ni de aprobación: cada modelo (FICO, VantageScore) pesa la utilización a su manera. Es aparte de la reparación de cuentas negativas.",
      W,
    ),
    M,
    y,
  );

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font(7, "normal", MUTED);
    doc.text(`${input.organization.legalName} · ${data.clientName}`, M, PAGE_HEIGHT - 8);
    doc.text(`Página ${p} de ${pages}`, PAGE_WIDTH - M, PAGE_HEIGHT - 8, { align: "right" });
  }
  return toBuffer(doc);
}
