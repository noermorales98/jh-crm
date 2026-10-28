/**
 * PDF del Análisis de Crédito y Plan de Acción: mismo contenido, colores y
 * gráficas que la vista web (barras por buró, dona de límites, matriz ✓/✗,
 * tarjetas de prioridades). Dibujado con jsPDF en el servidor.
 */
import { jsPDF } from "jspdf";
import { metricText, presentAmount, presentUtilization } from "@/src/lib/credit/metrics-view";
import { ACTION_PLAN_POINT_IMPACT_UNAVAILABLE } from "@/src/lib/credit/action-plan-howto";
import type { ClientActionPlan } from "@/src/server/credit-reports/action-plan";
import { logoBoxMm } from "./logo";
import { toBuffer, PAGE_WIDTH, PAGE_HEIGHT } from "./base";
import type { PdfOrganizationInfo } from "./base";
import { formatForPdf } from "../format/dates";

export type ActionPlanPdfData = {
  organization: PdfOrganizationInfo;
  plan: ClientActionPlan;
  bureauLabels: Record<string, string>;
  negativeTypeLabels: Record<string, string>;
  actionKindLabels: Record<string, string>;
  actionPriorityLabels: Record<string, string>;
  timezone?: string;
};

type RGB = [number, number, number];
type Tone = "info" | "success" | "purple" | "warning" | "danger";

const M = 14;
const W = PAGE_WIDTH - M * 2;
const BOTTOM = PAGE_HEIGHT - 16;

const INK: RGB = [28, 28, 30];
const MUTED: RGB = [95, 95, 102];
const LINE: RGB = [222, 222, 228];
const TONES: Record<Tone, { soft: RGB; ink: RGB }> = {
  info: { soft: [232, 240, 253], ink: [10, 91, 215] },
  success: { soft: [232, 244, 236], ink: [29, 122, 50] },
  purple: { soft: [243, 233, 250], ink: [126, 34, 206] },
  warning: { soft: [248, 239, 230], ink: [178, 80, 0] },
  danger: { soft: [251, 232, 234], ink: [215, 0, 21] },
};
const BUREAU_RGB: Record<string, RGB> = {
  EQUIFAX: [200, 54, 79],
  EXPERIAN: [47, 91, 211],
  TRANSUNION: [11, 143, 138],
};
const CARD_RGB: RGB[] = [
  [59, 130, 246],
  [34, 197, 94],
  [245, 158, 11],
  [139, 92, 246],
  [239, 68, 68],
  [6, 182, 212],
  [236, 72, 153],
  [132, 204, 22],
];

const SCORE_MIN = 720;
const UTIL_MAX = 10;
const INQUIRY_MAX = 3;
const AU_MAX = 3;

function money(amount: number | null, currency: string | null): string {
  return metricText(
    presentAmount({ amount, currency, status: amount == null ? "UNKNOWN" : "KNOWN" }),
  );
}

function util(bps: number | null): string {
  return metricText(
    presentUtilization({ basisPoints: bps, status: bps == null ? "UNKNOWN" : "KNOWN" }),
  );
}

function years(months: number | null): string {
  if (months == null) return "sin dato";
  return `${Math.round(months / 1.2) / 10} años`;
}

/**
 * PDF del Análisis de Crédito y Plan de Acción (mismo diseño que la web).
 */
export function generateActionPlanPdf(data: ActionPlanPdfData): Buffer {
  const { plan } = data;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({
    title: `Análisis de Crédito ${plan.clientName}`,
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
  const ensure = (need: number) => {
    if (y + need > BOTTOM) {
      doc.addPage();
      y = M;
    }
  };
  const label = (key: string) => data.bureauLabels[key] ?? key;
  const wrap = (text: string, width: number) => doc.splitTextToSize(text, width) as string[];
  const para = (text: string, x: number, width: number, size = 8.5, rgb: RGB = MUTED) => {
    font(size, "normal", rgb);
    const lines = wrap(text, width);
    doc.text(lines, x, y);
    y += lines.length * (size * 0.42) + 1.5;
  };
  const chip = (text: string, x: number, cy: number, tone: Tone): number => {
    font(7.5, "bold", TONES[tone].ink);
    const w = doc.getTextWidth(text) + 6;
    color(TONES[tone].soft, "fill");
    doc.roundedRect(x, cy - 3.6, w, 5.4, 2.7, 2.7, "F");
    doc.text(text, x + 3, cy);
    return w;
  };
  const section = (n: number, title: string, tone: Tone, minHeight = 30) => {
    ensure(minHeight);
    y += 3;
    color(TONES[tone].soft, "fill");
    doc.roundedRect(M, y, W, 9, 2, 2, "F");
    color([255, 255, 255], "fill");
    color(LINE, "draw");
    doc.roundedRect(M + 2.5, y + 1.6, 6, 5.8, 1.2, 1.2, "FD");
    font(9, "bold", INK);
    doc.text(String(n), M + 5.5, y + 5.6, { align: "center" });
    font(10.5, "bold", TONES[tone].ink);
    doc.text(title, M + 11.5, y + 6);
    y += 13;
  };
  const kpis = (items: { label: string; value: string; hint?: string; tone?: Tone }[]) => {
    ensure(18);
    const gap = 2.5;
    const w = (W - gap * (items.length - 1)) / items.length;
    items.forEach((item, i) => {
      const x = M + i * (w + gap);
      color(LINE, "draw");
      doc.roundedRect(x, y, w, 15, 1.8, 1.8, "S");
      font(6.2, "bold", MUTED);
      doc.text(item.label.toUpperCase(), x + 2.5, y + 4, { maxWidth: w - 5 });
      font(12, "bold", item.tone ? TONES[item.tone].ink : INK);
      doc.text(item.value, x + 2.5, y + 9.8, { maxWidth: w - 5 });
      if (item.hint) {
        font(6.5, "normal", MUTED);
        doc.text(item.hint, x + 2.5, y + 13.2, { maxWidth: w - 5 });
      }
    });
    y += 18;
  };
  const callout = (title: string, body: string, tone: Tone) => {
    font(8, "normal", MUTED);
    const lines = wrap(body, W - 10);
    const h = 7 + lines.length * 3.5 + 2;
    ensure(h + 2);
    color(TONES[tone].soft, "fill");
    doc.roundedRect(M, y, W, h, 2, 2, "F");
    font(8.5, "bold", TONES[tone].ink);
    doc.text(title, M + 4, y + 5);
    font(8, "normal", MUTED);
    doc.text(lines, M + 4, y + 9.5);
    y += h + 3;
  };
  const mark = (value: boolean | null, cx: number, cy: number) => {
    if (value == null) {
      font(6.5, "normal", MUTED);
      doc.text("Sin dato", cx, cy + 1, { align: "center" });
      return;
    }
    const tone = value ? TONES.success.ink : TONES.danger.ink;
    color(tone, "draw");
    doc.setLineWidth(0.4);
    doc.circle(cx, cy, 2, "S");
    if (value) {
      doc.line(cx - 1, cy, cx - 0.2, cy + 0.9);
      doc.line(cx - 0.2, cy + 0.9, cx + 1.1, cy - 0.8);
    } else {
      doc.line(cx - 0.8, cy - 0.8, cx + 0.8, cy + 0.8);
      doc.line(cx - 0.8, cy + 0.8, cx + 0.8, cy - 0.8);
    }
    doc.setLineWidth(0.2);
  };
  const barChart = (
    x: number,
    top: number,
    width: number,
    height: number,
    bars: { key: string; value: number | null; display: string }[],
    min: number,
    max: number,
    threshold: number,
  ) => {
    const span = Math.max(max - min, 1);
    const base = top + height;
    color(LINE, "draw");
    doc.line(x, base, x + width, base);
    const ty = base - (Math.min(Math.max((threshold - min) / span, 0), 1) * (height - 6));
    doc.setLineDashPattern([1, 1], 0);
    color(MUTED, "draw");
    doc.line(x, ty, x + width, ty);
    doc.setLineDashPattern([], 0);
    const slot = width / bars.length;
    bars.forEach((bar, i) => {
      const bw = Math.min(16, slot * 0.6);
      const bx = x + slot * i + (slot - bw) / 2;
      const ratio = bar.value == null ? 0 : Math.min(Math.max((bar.value - min) / span, 0.03), 1);
      const bh = ratio * (height - 6);
      color(BUREAU_RGB[bar.key] ?? MUTED, "fill");
      if (bh > 0) doc.roundedRect(bx, base - bh, bw, bh, 1, 1, "F");
      font(8, "bold", INK);
      doc.text(bar.display, bx + bw / 2, base - bh - 1.5, { align: "center" });
      color(BUREAU_RGB[bar.key] ?? MUTED, "fill");
      doc.circle(bx + bw / 2 - 6, base + 4, 0.9, "F");
      font(6.8, "normal", MUTED);
      doc.text(label(bar.key), bx + bw / 2 - 4.5, base + 4.8);
    });
  };
  const donut = (cx: number, cy: number, radius: number, slices: { value: number; rgb: RGB }[]) => {
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    const inner = radius * 0.6;
    let start = -Math.PI / 2;
    for (const slice of slices) {
      if (total <= 0 || slice.value <= 0) continue;
      const end = start + (slice.value / total) * Math.PI * 2;
      const steps = Math.max(4, Math.ceil(((end - start) / (Math.PI * 2)) * 48));
      const outer: [number, number][] = [];
      const innerPts: [number, number][] = [];
      for (let k = 0; k <= steps; k++) {
        const a = start + ((end - start) * k) / steps;
        outer.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
        innerPts.push([cx + Math.cos(a) * inner, cy + Math.sin(a) * inner]);
      }
      const pts = [...outer, ...innerPts.reverse()];
      const deltas = pts.slice(1).map((p, k) => [p[0] - pts[k]![0], p[1] - pts[k]![1]]);
      color(slice.rgb, "fill");
      doc.lines(deltas, pts[0]![0], pts[0]![1], [1, 1], "F", true);
      start = end;
    }
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
  doc.text("Análisis de Crédito y Plan de Acción", PAGE_WIDTH / 2, y + 4, { align: "center" });
  y += 10;
  font(8, "bold", MUTED);
  doc.text(data.organization.legalName.toUpperCase(), PAGE_WIDTH / 2, y, { align: "center" });
  y += 5;
  font(9.5, "normal", INK);
  doc.text(`Analizando a: ${plan.clientName}`, PAGE_WIDTH / 2, y, { align: "center" });
  y += 4.5;
  font(7.5, "normal", MUTED);
  doc.text(`Reporte del ${formatForPdf(plan.reportDate, "UTC")}`, PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 7;
  const chips: [string, Tone][] = [
    [plan.qualified ? "Calificado en al menos un buró" : "No calificado actualmente", plan.qualified ? "success" : "danger"],
    [`Estimado de fondeo: ${plan.qualified ? "En revisión" : "Califica primero"}`, "warning"],
    [`${plan.bureausApproved} de 3 burós aprobados`, "purple"],
  ];
  font(7.5, "bold", INK);
  const chipsWidth =
    chips.reduce((sum, [text]) => sum + doc.getTextWidth(text) + 6, 0) + (chips.length - 1) * 3;
  let cxPos = PAGE_WIDTH / 2 - chipsWidth / 2;
  for (const [text, tone] of chips) cxPos += chip(text, cxPos, y, tone) + 3;
  y += 6;

  // 1. Desglose por buró
  section(1, "Desglose por Buró (Equifax, Experian, TransUnion)", "info", 80);
  const half = (W - 8) / 2;
  const chartTop = y + 4;
  font(8.5, "bold", INK);
  doc.text("Comparación de Puntajes", M, y);
  doc.text("Utilización de Crédito", M + half + 8, y);
  barChart(
    M,
    chartTop,
    half,
    38,
    plan.bureaus.map((b) => ({ key: b.bureau, value: b.score, display: b.score?.toString() ?? "Sin dato" })),
    550,
    850,
    SCORE_MIN,
  );
  const utilMax = Math.max(
    25,
    ...plan.bureaus.map((b) => Math.ceil(b.utilizationBps != null ? b.utilizationBps / 100 : (b.utilization ?? 0))),
  );
  barChart(
    M + half + 8,
    chartTop,
    half,
    38,
    plan.bureaus.map((b) => ({
      key: b.bureau,
      value: b.utilizationBps != null ? b.utilizationBps / 100 : b.utilization,
      display: b.utilizationText,
    })),
    0,
    utilMax,
    UTIL_MAX,
  );
  y = chartTop + 46;
  plan.bureaus.forEach((b, i) => {
    const sy = y + i * 4.2;
    const scoreOk = b.score != null && b.score >= SCORE_MIN;
    const utilOk = b.utilization != null && b.utilization <= UTIL_MAX;
    font(7.5, "normal", MUTED);
    doc.text(`${label(b.bureau)}:`, M, sy);
    doc.text(`${label(b.bureau)}:`, M + half + 8, sy);
    font(7.5, "bold", scoreOk ? TONES.success.ink : TONES.danger.ink);
    doc.text(`${b.score ?? "Sin dato"} · ${b.score == null ? "Sin dato" : scoreOk ? "Excelente" : "Necesita mejorar"}`, M + half, sy, { align: "right" });
    font(7.5, "bold", b.utilization == null ? MUTED : utilOk ? TONES.success.ink : TONES.danger.ink);
    doc.text(`${b.utilizationText} · ${b.utilization == null ? "Sin dato" : utilOk ? "Excelente" : "Necesita mejorar"}`, M + W, sy, { align: "right" });
  });
  y += 15;
  const fails = (pred: (b: ClientActionPlan["bureaus"][number]) => boolean) =>
    plan.bureaus.filter(pred).map((b) => label(b.bureau)).join(", ");
  const bullets = [
    `Puntaje (mínimo ${SCORE_MIN}): ${fails((b) => b.score == null || b.score < SCORE_MIN) || "los 3 burós cumplen"}${fails((b) => b.score == null || b.score < SCORE_MIN) ? " no alcanza" : ""}.`,
    `Utilización (máximo ${UTIL_MAX}%): ${fails((b) => b.utilization != null && b.utilization > UTIL_MAX) || "dentro del límite"}${fails((b) => b.utilization != null && b.utilization > UTIL_MAX) ? " lo supera" : ""}.`,
    `Hard inquiries: ${plan.bureaus.map((b) => `${label(b.bureau)} ${b.inquiries ?? "sin dato"}`).join(", ")}${plan.bureaus[0]?.inquiriesNote ? ` (${plan.bureaus[0].inquiriesNote})` : ""}.`,
    `Edad promedio: ${plan.bureaus.map((b) => `${label(b.bureau)} ${years(b.avgAgeMonths)}`).join(", ")}.`,
    `Historial de pagos: ${plan.negativeCount} negativos en ${plan.totalItems} cuentas; bloquean en ${fails((b) => b.blockingNegatives > 0) || "ningún buró"}.`,
  ];
  for (const text of bullets) {
    ensure(6);
    color(MUTED, "fill");
    doc.circle(M + 1, y - 1, 0.6, "F");
    para(text, M + 3.5, W - 4, 8, MUTED);
  }

  // 2. Crédito rotativo
  section(2, "Estructura de Crédito Rotativo", "success", 70);
  const rv = plan.revolving;
  kpis([
    { label: "Tarjetas abiertas", value: rv.openCards?.toString() ?? "Sin dato", hint: `${rv.primaryCards ?? "Sin dato"} principal, ${rv.auCards} AU` },
    { label: "Límite total", value: money(rv.totalLimit, rv.currency), hint: `${money(rv.totalUsed, rv.currency)} usado` },
    { label: "Tarjetas >= 2 000", value: String(rv.cardsGe2k) },
    { label: "Tarjetas >= 5 000", value: String(rv.cardsGe5k), hint: rv.cardsGe5k === 0 ? "Ninguna" : undefined },
    { label: "Utilización total", value: util(rv.utilizationBps), hint: rv.coverageLabel },
  ]);
  if (rv.cards.length > 0) {
    ensure(48);
    const donutR = 19;
    donut(
      M + donutR + 2,
      y + donutR + 2,
      donutR,
      rv.cards.map((c, i) => ({ value: c.limit ?? 0, rgb: CARD_RGB[i % CARD_RGB.length]! })),
    );
    font(6, "bold", MUTED);
    doc.text("LÍMITE TOTAL", M + donutR + 2, y + donutR, { align: "center" });
    font(9, "bold", INK);
    doc.text(money(rv.totalLimit, rv.currency), M + donutR + 2, y + donutR + 4.5, { align: "center" });
    const tx = M + donutR * 2 + 10;
    const tw = M + W - tx;
    font(6.5, "bold", MUTED);
    doc.text("EMISOR", tx, y + 2);
    doc.text("LÍMITE", tx + tw * 0.62, y + 2, { align: "right" });
    doc.text("USADO", tx + tw * 0.8, y + 2, { align: "right" });
    doc.text("UTIL", tx + tw, y + 2, { align: "right" });
    let ry = y + 7;
    rv.cards.slice(0, 8).forEach((c, i) => {
      color(LINE, "draw");
      doc.line(tx, ry - 3.6, tx + tw, ry - 3.6);
      color(CARD_RGB[i % CARD_RGB.length]!, "fill");
      doc.roundedRect(tx, ry - 2.3, 2.2, 2.2, 0.4, 0.4, "F");
      font(7.5, "normal", INK);
      doc.text(c.creditorName.slice(0, 28), tx + 3.5, ry);
      font(7.5, "bold", INK);
      doc.text(money(c.limit, c.currency), tx + tw * 0.62, ry, { align: "right" });
      font(7.5, "normal", MUTED);
      doc.text(money(c.balance, c.currency), tx + tw * 0.8, ry, { align: "right" });
      const high = (c.utilizationBps ?? 0) > 3000;
      font(7.5, high ? "bold" : "normal", high ? TONES.danger.ink : MUTED);
      doc.text(c.openStatusUnknown ? "Sin dato" : util(c.utilizationBps), tx + tw, ry, { align: "right" });
      ry += 5;
    });
    y = Math.max(y + donutR * 2 + 6, ry + 1);
  } else {
    para("Sin tarjetas abiertas con límite en este reporte.", M, W);
  }
  callout(
    "Análisis",
    [
      `Tarjetas abiertas: ${rv.openCards ?? "sin dato"}; usuarios autorizados: ${rv.auCards}.`,
      `Límite total combinado: ${money(rv.totalLimit, rv.currency)}.`,
      `Tarjetas con límite de 2 000 o más: ${rv.cardsGe2k}. Con 5 000 o más: ${rv.cardsGe5k}.`,
    ].join(" "),
    "success",
  );

  // 3. Usuario autorizado
  section(3, "Estrategia de Usuario Autorizado (AU)", "purple", 40);
  const au = plan.authorizedUsers.confirmedCount;
  kpis([
    { label: "Cuentas AU activas", value: String(au), hint: `máx ${AU_MAX}` },
    { label: "Tarjetas primarias", value: rv.primaryCards?.toString() ?? "Sin dato" },
    { label: "Tope de AU usado", value: `${Math.min(au, AU_MAX)} / ${AU_MAX}` },
    { label: "Espacio para agregar", value: String(Math.max(AU_MAX - au, 0)), tone: au < AU_MAX ? "success" : undefined },
  ]);
  callout(
    "Impacto en financiamiento",
    `Las cuentas AU suman a la edad promedio y al límite disponible, pero no cambian por sí solas la elegibilidad para financiamiento de negocio. ${plan.authorizedUsers.note}`,
    "info",
  );

  // 4. Matriz
  section(4, "Preparación para Financiamiento por Buró", "success", 60);
  const colX = [M + W * 0.62, M + W * 0.75, M + W * 0.88];
  font(6.5, "bold", MUTED);
  doc.text("CATEGORÍA", M, y);
  plan.fundingMatrix.forEach((r, i) => doc.text(label(r.bureau).toUpperCase(), colX[i]!, y, { align: "center" }));
  y += 4;
  const rows: [string, (r: ClientActionPlan["fundingMatrix"][number]) => boolean | null][] = [
    [`Puntaje >= ${SCORE_MIN}`, (r) => r.scoreOk],
    ["Sin elementos negativos", (r) => r.noNegatives],
    [`Utilización <= ${UTIL_MAX}%`, (r) => r.utilOk],
    ["Edad de crédito >= 2.5 años", (r) => r.ageOk],
    [
      `<= ${INQUIRY_MAX} consultas (últimos 6 meses)`,
      (r) => {
        const b = plan.bureaus.find((x) => x.bureau === r.bureau);
        return b?.inquiries == null ? null : b.inquiries <= INQUIRY_MAX;
      },
    ],
    ["Estructura sólida (3+ primarias, una de 5 000+ y otra de 2 000+)", (r) => r.structureOk],
    ["Límite combinado alto (40 000+)", (r) => r.combinedLimitOk],
  ];
  for (const [title, get] of rows) {
    ensure(7);
    color(LINE, "draw");
    doc.line(M, y - 1, M + W, y - 1);
    font(7.8, "normal", INK);
    doc.text(title, M, y + 3.2, { maxWidth: W * 0.55 });
    plan.fundingMatrix.forEach((r, i) => mark(get(r), colX[i]!, y + 2.2));
    y += 6.5;
  }
  const approvedTone: Tone = plan.bureausApproved > 0 ? "success" : "danger";
  color(TONES[approvedTone].soft, "fill");
  doc.roundedRect(M, y, W, 7, 1.5, 1.5, "F");
  font(8, "normal", TONES[approvedTone].ink);
  doc.text(`${plan.bureausApproved} de 3 burós cumplen todos los criterios verificados.`, M + 3, y + 4.6);
  y += 10;

  // 5. Veredicto
  section(5, "Veredicto", "warning", 30);
  const verdict = plan.qualified
    ? `El perfil cumple todos los criterios en ${plan.bureausApproved} buró(s). Revisa programas de financiamiento con datos verificados.`
    : "Tu perfil crediticio no califica actualmente para financiamiento. Sigue el plan de acción de la Sección 6 para mejorar tu elegibilidad.";
  font(10, "bold", INK);
  const vLines = wrap(verdict, W - 16);
  const vh = vLines.length * 4.6 + 12;
  color(TONES.purple.soft, "fill");
  doc.roundedRect(M, y, W, vh, 2, 2, "F");
  doc.text(vLines, PAGE_WIDTH / 2, y + 7, { align: "center" });
  font(8, "normal", MUTED);
  doc.text("Podemos ayudarte a reparar o estructurar tu crédito para que califiques a financiamiento.", PAGE_WIDTH / 2, y + vh - 3.5, { align: "center" });
  y += vh + 3;

  // 6. Plan de acción
  section(6, "Plan de Acción", "success", 50);
  if (plan.negativeAccounts.length > 0) {
    font(8.5, "bold", INK);
    doc.text(`Cuentas negativas a revisar (${plan.negativeAccounts.length})`, M, y);
    y += 4;
    for (const account of plan.negativeAccounts.slice(0, 14)) {
      ensure(6);
      color(BUREAU_RGB[account.bureau] ?? MUTED, "fill");
      doc.rect(M, y - 2.8, 1, 3.8, "F");
      font(7.5, "bold", INK);
      doc.text(account.creditorName.slice(0, 32), M + 2.5, y);
      font(7.5, "normal", MUTED);
      doc.text(label(account.bureau), M + 62, y);
      doc.text(
        account.negativeType ? (data.negativeTypeLabels[account.negativeType] ?? account.negativeType) : "Negativo",
        M + 92,
        y,
      );
      doc.text(
        account.old
          ? "Atraso de más de 3 años (no bloquea)"
          : account.dateReported
            ? `Reportada ${formatForPdf(account.dateReported, "UTC")}`
            : "",
        M + 125,
        y,
      );
      y += 4.6;
    }
    if (plan.negativeAccounts.length > 14) {
      para(`Y ${plan.negativeAccounts.length - 14} más en el detalle del reporte.`, M, W, 7.5);
    }
    y += 2;
  }
  const colW = (W - 4) / 2;
  for (let i = 0; i < plan.priorities.length; i += 2) {
    const pair = plan.priorities.slice(i, i + 2);
    font(8, "normal", MUTED);
    const heights = pair.map((p) => 17 + Math.min(wrap(p.summary, colW - 6).length, 4) * 3.4);
    const h = Math.max(...heights);
    ensure(h + 3);
    pair.forEach((priority, k) => {
      const x = M + k * (colW + 4);
      color(LINE, "draw");
      doc.roundedRect(x, y, colW, h, 2, 2, "S");
      font(6.2, "bold", MUTED);
      doc.text(`PRIORIDAD ${i + k + 1}`, x + 3, y + 4.5);
      const tone: Tone = priority.severity === "CRITICO" ? "danger" : "warning";
      font(6.5, "bold", TONES[tone].ink);
      const sev = priority.severity === "CRITICO" ? "CRÍTICO" : "IMPORTANTE";
      const sw = doc.getTextWidth(sev) + 4;
      color(TONES[tone].soft, "fill");
      doc.roundedRect(x + colW - sw - 3, y + 2, sw, 4, 2, 2, "F");
      doc.text(sev, x + colW - sw - 1, y + 4.9);
      font(8.8, "bold", INK);
      doc.text(priority.title, x + 3, y + 9.5, { maxWidth: colW - 6 });
      font(7.6, "normal", MUTED);
      doc.text(wrap(priority.summary, colW - 6).slice(0, 4), x + 3, y + 13.5);
      const impact =
        priority.ficoImpact !== ACTION_PLAN_POINT_IMPACT_UNAVAILABLE ? ` · ${priority.ficoImpact}` : "";
      font(7, "bold", TONES.purple.ink);
      doc.text(`Plazo: ${priority.timeline}${impact}`, x + 3, y + h - 2.5);
    });
    y += h + 3;
  }
  if (plan.actions.length > 0) {
    ensure(10);
    font(7, "bold", MUTED);
    doc.text("ACCIONES DETECTADAS EN ESTE REPORTE", M, y);
    y += 4;
    for (const action of plan.actions) {
      para(
        `${data.actionKindLabels[action.kind] ?? action.kind} · ${data.actionPriorityLabels[action.priority] ?? action.priority} · ${action.summary}`,
        M,
        W,
        7.8,
      );
    }
  }

  // 7. Secuencia de financiamiento
  section(7, `Secuencia de Financiamiento Recomendada${plan.clientState ? ` (${plan.clientState})` : ""}`, "warning", 50);
  callout(
    plan.qualified ? "Financiamiento en revisión" : "Financiamiento No Disponible",
    plan.qualified
      ? "Confirma ingresos, tiempo del negocio y programas disponibles antes de aplicar."
      : "Tu perfil crediticio no califica actualmente para financiamiento. Sigue el plan de acción de la Sección 6 para mejorar tu elegibilidad.",
    plan.qualified ? "success" : "danger",
  );
  ensure(26);
  const stats: [string, string, Tone][] = [
    [plan.avgScore?.toString() ?? "Sin dato", "Score promedio informativo", "purple"],
    [util(rv.utilizationBps), "Utilización total (saldo / límite)", "success"],
    [plan.qualified ? "En revisión" : "Califica primero", "Potencial de financiamiento", "warning"],
  ];
  const sw3 = (W - 6) / 3;
  stats.forEach(([value, caption, tone], i) => {
    const x = M + i * (sw3 + 3);
    color(TONES[tone].soft, "fill");
    doc.roundedRect(x, y, sw3, 22, 2, 2, "F");
    font(15, "bold", TONES[tone].ink);
    doc.text(value, x + sw3 / 2, y + 11, { align: "center", maxWidth: sw3 - 4 });
    font(7, "normal", MUTED);
    doc.text(caption, x + sw3 / 2, y + 17.5, { align: "center", maxWidth: sw3 - 4 });
  });
  y += 27;
  para(
    "Análisis educativo basado en el reporte importado. No garantiza la eliminación de cuentas, cambios de puntaje ni aprobaciones de financiamiento. Los datos exactos y verificables pueden permanecer en el reporte hasta 7 años (10 en bancarrota Capítulo 7).",
    M,
    W,
    7,
  );

  // Pie de página
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font(7, "normal", MUTED);
    doc.text(`${data.organization.legalName} · ${plan.clientName}`, M, PAGE_HEIGHT - 8);
    doc.text(`Página ${p} de ${pages}`, PAGE_WIDTH - M, PAGE_HEIGHT - 8, { align: "right" });
  }

  return toBuffer(doc);
}
