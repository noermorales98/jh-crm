import { LEAD_CHANNEL_LABELS, labelFor } from "@/src/lib/labels";

const CREDIT_ANALYSIS_MARKERS = [
  "análisis de mi reporte",
  "analisis de mi reporte",
  "análisis crediticio",
  "analisis crediticio",
  "reparación crediticia",
  "reparacion crediticia",
  "consulta de crédito ($1",
  "consulta de credito ($1",
];

export type LeadMessage = {
  id: string;
  body: string;
  at: Date | string;
  kind: "consultation" | "activity" | "note";
  authorName?: string | null;
};

export type LeadIntent = {
  /** Origen legible (sitio, canal, UTM…). */
  originLabel: string;
  /** Qué quiere el prospecto. */
  intentLabel: string;
  /** Mensajes del formulario / consultas (conservados). */
  messages: LeadMessage[];
  isCreditAnalysis: boolean;
  isWebsiteContact: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

function looksLikeCreditAnalysis(message: string | null | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return CREDIT_ANALYSIS_MARKERS.some((m) => lower.includes(m));
}

function extractMessageFromDescription(description: string): string | null {
  const markers = [
    "Consulta desde el sitio web:\n",
    "Nueva consulta desde el sitio web:\n",
  ];
  for (const marker of markers) {
    const idx = description.indexOf(marker);
    if (idx >= 0) {
      const body = description.slice(idx + marker.length).trim();
      return body.length ? body : null;
    }
  }
  return null;
}

/**
 * Interpreta origen + intención + mensajes de un lead (Client + Opportunity).
 */
export function resolveLeadIntent(input: {
  source?: string | null;
  campaign?: string | null;
  leadChannel?: string | null;
  serviceRequested?: string | null;
  attribution?: unknown;
  consultations?: Array<{
    id: string;
    notes: string | null;
    requestedAt: Date | string;
  }> | null;
  activities?: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: Date | string;
    metadata?: unknown;
  }> | null;
  notes?: Array<{
    id: string;
    body: string;
    createdAt: Date | string;
    author?: { name: string | null } | null;
  }> | null;
}): LeadIntent {
  const attribution = asRecord(input.attribution);
  const landingPage = textOf(attribution?.landingPage);
  const referrer = textOf(attribution?.referrer);
  const utmSource = textOf(attribution?.utm_source);
  const utmCampaign = textOf(attribution?.utm_campaign);

  const messages: LeadMessage[] = [];
  const seen = new Set<string>();

  function pushMessage(
    id: string,
    body: string | null | undefined,
    at: Date | string,
    kind: LeadMessage["kind"],
    authorName?: string | null,
  ) {
    const text = body?.trim();
    if (!text) return;
    const key = `${kind}:${text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    messages.push({ id, body: text, at, kind, authorName });
  }

  for (const n of input.notes ?? []) {
    pushMessage(n.id, n.body, n.createdAt, "note", n.author?.name ?? null);
  }
  for (const c of input.consultations ?? []) {
    pushMessage(c.id, c.notes, c.requestedAt, "consultation");
  }
  for (const a of input.activities ?? []) {
    const meta = asRecord(a.metadata);
    // Evitar duplicar notas ya listadas desde Note.
    if (textOf(meta?.noteId) || textOf(meta?.source) === "lead_message") {
      continue;
    }
    const fromDesc = extractMessageFromDescription(a.description);
    const fromMeta = textOf(meta?.message);
    // Notas libres guardadas solo en Activity (legacy): mostrar descripción.
    if (a.type === "NOTE" && !fromDesc && !fromMeta) {
      pushMessage(a.id, a.description, a.createdAt, "note");
    } else {
      pushMessage(a.id, fromDesc ?? fromMeta, a.createdAt, "activity");
    }
  }

  messages.sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    return tb - ta;
  });
  const primaryMessage = messages[0]?.body ?? null;
  const isCreditAnalysis =
    looksLikeCreditAnalysis(primaryMessage) ||
    looksLikeCreditAnalysis(input.serviceRequested) ||
    /cr[eé]dito/i.test(input.serviceRequested ?? "");

  const isWebsiteContact =
    (input.source?.toLowerCase().includes("sitio") ?? false) ||
    Boolean(landingPage) ||
    messages.some((m) => m.kind === "consultation" || m.kind === "activity");

  const channelLabel = input.leadChannel
    ? labelFor(LEAD_CHANNEL_LABELS, input.leadChannel)
    : null;

  const originParts = [
    input.source?.trim() || null,
    channelLabel,
    utmSource ? `UTM: ${utmSource}` : null,
    utmCampaign ? `Campaña: ${utmCampaign}` : null,
    landingPage ? `Página: ${landingPage}` : null,
    referrer && referrer !== landingPage ? `Referrer: ${referrer}` : null,
    input.campaign?.trim() ? `Deal: ${input.campaign.trim()}` : null,
  ].filter(Boolean) as string[];

  const originLabel =
    originParts.length > 0
      ? originParts[0]!
      : isWebsiteContact
        ? "Sitio web"
        : "Registro manual en CRM";

  let intentLabel: string;
  if (input.serviceRequested?.trim()) {
    intentLabel = input.serviceRequested.trim();
  } else if (isCreditAnalysis) {
    intentLabel = "Análisis y reparación de crédito (consulta $1)";
  } else if (isWebsiteContact && primaryMessage) {
    intentLabel = "Consulta general / formulario de contacto";
  } else if (isWebsiteContact) {
    intentLabel = "Solicitud desde el sitio web";
  } else {
    intentLabel = "Sin servicio indicado";
  }

  return {
    originLabel,
    intentLabel,
    messages,
    isCreditAnalysis,
    isWebsiteContact,
  };
}

/** Fecha de registro estilo HIG: “Hoy a las 9:30 a.m.” / fecha completa. */
export function formatLeadRegisteredAt(
  date: Date | string,
  timezone = "America/Chicago",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";

  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat("es-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const fullFmt = new Intl.DateTimeFormat("es-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const today = dayFmt.format(new Date());
  const day = dayFmt.format(d);
  if (day === today) {
    return `Hoy a las ${timeFmt.format(d)}`;
  }

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (day === dayFmt.format(yesterdayDate)) {
    return `Ayer a las ${timeFmt.format(d)}`;
  }

  return fullFmt.format(d);
}
