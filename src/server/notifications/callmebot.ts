import { DomainError } from "@/src/server/errors";

const CALLMEBOT_URL = "https://api.callmebot.com/whatsapp.php";

/** E.164: + y 8–15 dígitos, código de país incluido. */
export const CALLMEBOT_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export function normalizeCallmebotPhone(raw: string): string {
  const compact = raw.trim().replace(/[\s()-]/g, "");
  const withPlus = compact.startsWith("+") ? compact : `+${compact}`;
  return withPlus;
}

export function assertCallmebotPhone(phone: string): string {
  const normalized = normalizeCallmebotPhone(phone);
  if (!CALLMEBOT_PHONE_REGEX.test(normalized)) {
    throw new DomainError(
      "El teléfono de WhatsApp debe incluir código de país (ej. +17135551234).",
    );
  }
  return normalized;
}

export interface CallmebotSendInput {
  phone: string;
  apiKey: string;
  text: string;
}

export interface CallmebotSendResult {
  ok: boolean;
  status: number;
  message: string;
}

/**
 * Envía un texto por WhatsApp vía CallMeBot (API gratuita, uso personal).
 * GET https://api.callmebot.com/whatsapp.php?phone=&text=&apikey=
 * Nunca registrar la URL completa: incluye el apikey.
 */
export async function sendCallmebotMessage(
  input: CallmebotSendInput,
): Promise<CallmebotSendResult> {
  const phone = assertCallmebotPhone(input.phone);
  const apiKey = input.apiKey.trim();
  const text = input.text.trim();
  if (!apiKey) {
    throw new DomainError("Falta el API key de CallMeBot.");
  }
  if (!text) {
    throw new DomainError("El mensaje de WhatsApp no puede estar vacío.");
  }

  const url = new URL(CALLMEBOT_URL);
  url.searchParams.set("phone", phone);
  url.searchParams.set("text", text);
  url.searchParams.set("apikey", apiKey);

  let status = 0;
  let body = "";
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "text/plain, text/html;q=0.8" },
    });
    status = response.status;
    body = (await response.text()).trim();
  } catch (error) {
    const reason = error instanceof Error ? error.name : "error";
    console.error("[callmebot] fallo de red:", reason);
    throw new DomainError(
      "No se pudo contactar a CallMeBot. Revisa la conexión e inténtalo de nuevo.",
    );
  }

  const lower = body.toLowerCase();
  const rejected =
    status >= 400 ||
    /invalid|error|blocked|not authorized|wrong apikey|api key/i.test(lower);

  if (rejected) {
    throw new DomainError(
      "CallMeBot rechazó el envío. Verifica el número, el API key y que el bot esté activado en WhatsApp.",
    );
  }

  return { ok: true, status, message: body.slice(0, 200) || "Mensaje enviado." };
}

export function formatWhatsappNotification(input: {
  title: string;
  body?: string | null;
  link?: string | null;
}): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const lines = ["*J&H CRM*", input.title];
  if (input.body?.trim()) lines.push(input.body.trim());
  if (input.link) {
    const href = input.link.startsWith("http")
      ? input.link
      : `${appUrl}${input.link.startsWith("/") ? "" : "/"}${input.link}`;
    if (href) lines.push(href);
  }
  return lines.join("\n");
}
