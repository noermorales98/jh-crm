import { metricText, presentAmount, presentUtilization } from "@/src/lib/credit/metrics-view";
import { startDocument, toBuffer, MARGIN, PAGE_WIDTH } from "./base";
import type { PdfOrganizationInfo } from "./base";
import { formatForPdf } from "../format/dates";
import { FUNDING_ESTIMATE_MESSAGE } from "@/src/lib/credit/funding-estimate";

export type ActionPlanPdfData = {
  organization: PdfOrganizationInfo;
  clientName: string;
  reportDate: Date;
  timezone?: string;
  verdict: string;
  avgScore: number | null;
  avgUtilization: number | null;
  bureaus: {
    bureau: string;
    score: number | null;
    utilizationBps: number | null;
    utilizationStatus: "KNOWN" | "PARTIAL" | "UNKNOWN";
    inquiries: number | null;
  }[];
  revolving: {
    openCards: number | null;
    auCards: number;
    totalLimit: number | null;
    currency: string | null;
    utilizationBps: number | null;
    utilizationStatus: "KNOWN" | "PARTIAL" | "UNKNOWN";
  };
  authorizedUsers: {
    confirmedCount: number;
    withAuthorizedUsersBps: number | null;
    note: string;
  };
  actions: {
    priority: string;
    summary: string;
    observationIds: string[];
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
  para(FUNDING_ESTIMATE_MESSAGE);

  section("1. Desglose por buró");
  for (const b of data.bureaus) {
    row(
      b.bureau,
      [
        b.score != null ? String(b.score) : "—",
        `util ${metricText(presentUtilization({
          basisPoints: b.utilizationBps,
          status: b.utilizationStatus,
        }))}`,
        b.inquiries != null ? `${b.inquiries} contador` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  section("2. Crédito rotativo");
  row("Tarjetas abiertas", data.revolving.openCards == null ? "—" : String(data.revolving.openCards));
  row("Cuentas AU confirmadas", String(data.revolving.auCards));
  row(
    "Vista con AU",
    data.authorizedUsers.withAuthorizedUsersBps != null
      ? metricText(presentUtilization({
          basisPoints: data.authorizedUsers.withAuthorizedUsersBps,
          status: "KNOWN",
        }))
      : metricText(presentUtilization({ basisPoints: null, status: "UNKNOWN" })),
  );
  para(data.authorizedUsers.note);
  row(
    "Límite individual",
    metricText(presentAmount({
      amount: data.revolving.totalLimit,
      currency: data.revolving.currency,
      status: data.revolving.totalLimit == null ? "UNKNOWN" : "KNOWN",
    })),
  );
  row(
    "Utilización revolving",
    metricText(presentUtilization({
      basisPoints: data.revolving.utilizationBps,
      status: data.revolving.utilizationStatus,
    })),
  );

  section("3. Veredicto");
  para(data.verdict);
  row("Score promedio informativo", data.avgScore != null ? String(data.avgScore) : "—");
  row(
    "Utilización revolving",
    metricText(presentUtilization({
      basisPoints: data.revolving.utilizationBps,
      status: data.revolving.utilizationStatus,
    })),
  );

  section("4. Acciones");
  data.actions.forEach((action, i) => {
    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Prioridad ${i + 1} · ${action.priority}`, MARGIN, y);
    y += 5;
    para(action.summary);
    if (action.observationIds.length > 0) para(action.observationIds.join(", "));
  });

  return toBuffer(doc);
}
