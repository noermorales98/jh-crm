import type { LeadChannel } from "@prisma/client";

/** Payload de atribución (UTM + click IDs) guardado en Client.attribution. */
export type AttributionPayload = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  landingPage?: string;
  referrer?: string;
  /** Consentimiento SMS del formulario público (independiente de privacidad). */
  sms_consent?: boolean;
};

const ATTR_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "landingPage",
  "referrer",
] as const;

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : undefined;
}

/** Normaliza un objeto desconocido a AttributionPayload (omite vacíos). */
export function normalizeAttribution(input: unknown): AttributionPayload {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const out: AttributionPayload = {};
  for (const key of ATTR_KEYS) {
    const value = cleanString(raw[key]);
    if (value) out[key] = value;
  }
  if (raw.sms_consent === true || raw.smsConsent === true) {
    out.sms_consent = true;
  } else if (raw.sms_consent === false || raw.smsConsent === false) {
    out.sms_consent = false;
  }
  return out;
}

/**
 * Infiera canal tipado a partir de UTM / click IDs / fuente libre.
 * Prioridad: click IDs → utm_source/medium → source → referrer/landing.
 */
export function inferLeadChannel(
  attr: AttributionPayload,
  source?: string | null,
): LeadChannel {
  if (attr.fbclid) return "FACEBOOK";
  if (attr.gclid) return "GOOGLE";

  const hay = [
    attr.utm_source,
    attr.utm_medium,
    source,
    attr.referrer,
    attr.landingPage,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(facebook|fb|meta)\b/.test(hay)) return "FACEBOOK";
  if (/\b(instagram|ig)\b/.test(hay)) return "INSTAGRAM";
  if (/\b(google|gclid|adwords|cpc)\b/.test(hay)) return "GOOGLE";
  if (/\b(referral|referred|referido)\b/.test(hay)) return "REFERRAL";
  if (/\bmanual\b/.test(hay)) return "MANUAL";
  if (/\b(website|web|landing|sitio)\b/.test(hay) || attr.landingPage) {
    return "WEBSITE";
  }
  if (Object.keys(attr).length > 0 || (source && source.trim())) return "WEBSITE";
  return "OTHER";
}
