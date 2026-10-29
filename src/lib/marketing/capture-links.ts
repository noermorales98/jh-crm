/**
 * Página de captación (/empieza): un link por canal, con UTM, para saber de
 * dónde llega cada prospecto. Puro (sin BD): se usa en servidor y cliente.
 */

export const CAPTURE_PATH = "/empieza";

/** utm_medium fijo: separa estos leads de los que llegan por `/`. */
export const CAPTURE_MEDIUM = "captacion";

export const CAPTURE_CHANNELS = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "tiktok", label: "TikTok" },
  { key: "evento", label: "Volante o evento" },
  { key: "referido", label: "Referido" },
] as const;

export type CaptureChannel = (typeof CAPTURE_CHANNELS)[number]["key"];

export function captureChannelLabel(source: string | null | undefined): string {
  const found = CAPTURE_CHANNELS.find((c) => c.key === source);
  return found?.label ?? (source?.trim() ? source.trim() : "Sin canal");
}

/** «Feria de mayo 2026» → «feria-de-mayo-2026». */
export function slugCampaign(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function buildCaptureUrl(input: {
  baseUrl: string;
  channel: CaptureChannel | null;
  campaign?: string | null;
}): string {
  const url = new URL(CAPTURE_PATH, input.baseUrl.replace(/\/$/, "") + "/");
  if (input.channel) {
    url.searchParams.set("utm_source", input.channel);
    url.searchParams.set("utm_medium", CAPTURE_MEDIUM);
  }
  const campaign = slugCampaign(input.campaign);
  if (campaign) url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}

/** Nombre de archivo del QR: qr-empieza-instagram-feria.png */
export function captureQrFileName(channel: CaptureChannel | null, campaign?: string | null): string {
  return ["qr-empieza", channel, slugCampaign(campaign)].filter(Boolean).join("-") + ".png";
}
