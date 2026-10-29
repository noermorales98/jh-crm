/**
 * Contacto del negocio para el cliente: WhatsApp, link de agenda y firma del
 * representante. Puro (sin BD): se usa en servidor y en el cliente.
 */

/** Tamaño máximo de la firma (data URL) para no inflar cada contrato. */
export const SIGNATURE_MAX_CHARS = 300_000;

/**
 * Deja solo dígitos con código de país. 10 dígitos = EE. UU./Canadá (+1).
 * Devuelve null si no parece un número válido (8 a 15 dígitos, E.164).
 */
export function normalizeWhatsapp(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const full = digits.length === 10 ? `1${digits}` : digits;
  return full.length >= 8 && full.length <= 15 ? full : null;
}

export function whatsappLink(number: string | null | undefined, text?: string): string | null {
  const digits = normalizeWhatsapp(number);
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Solo https (Calendly, cal.com, Google Calendar…), sin credenciales en la URL. */
export function normalizeBookingUrl(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** La firma debe ser una imagen PNG/JPEG en data URL y no muy pesada. */
export function isValidSignatureDataUrl(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    value.length <= SIGNATURE_MAX_CHARS &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const AGENCY_SIGNATURE_MARKER = 'data-jh-agency-signature="1"';

/**
 * Bloque de firma de la agencia que se agrega al contrato al enviarlo.
 * Lleva un marcador para no duplicarlo si se reenvía.
 */
export function agencySignatureHtml(input: {
  signature: string;
  representativeName: string | null;
  legalName: string;
  dateLabel: string;
}): string {
  if (!isValidSignatureDataUrl(input.signature)) return "";
  const name = input.representativeName?.trim();
  return [
    `<div ${AGENCY_SIGNATURE_MARKER} style="margin-top:2.5rem">`,
    `<p><strong>Por ${escapeHtml(input.legalName)}</strong></p>`,
    `<p><img src="${input.signature}" alt="Firma del representante" style="max-height:72px;max-width:260px" /></p>`,
    name ? `<p>${escapeHtml(name)}</p>` : "",
    `<p>Fecha: ${escapeHtml(input.dateLabel)}</p>`,
    `</div>`,
  ].join("");
}

/** Agrega la firma de la agencia solo si el contrato aún no la tiene. */
export function withAgencySignature(contentHtml: string, block: string): string {
  if (!block || contentHtml.includes(AGENCY_SIGNATURE_MARKER)) return contentHtml;
  return `${contentHtml}${block}`;
}

/** Líneas de contacto para el pie de los correos al cliente (texto plano). */
export function contactFooterLines(input: { whatsappNumber?: string | null; bookingUrl?: string | null }): string[] {
  const lines: string[] = [];
  const wa = whatsappLink(input.whatsappNumber);
  if (wa) lines.push(`WhatsApp: ${wa}`);
  const booking = normalizeBookingUrl(input.bookingUrl);
  if (booking) lines.push(`Agenda una llamada: ${booking}`);
  return lines;
}
