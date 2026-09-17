/**
 * AU-004 — Cliente HTTP Whapi.Cloud (WhatsApp a clientes).
 * POST /messages/text — Bearer token. Nunca loguear el token.
 */
import { DomainError } from "@/src/server/errors";

export const DEFAULT_WHAPI_BASE_URL = "https://gate.whapi.cloud";

/** 8–15 dígitos internacionales sin +. */
export const WHAPI_TO_REGEX = /^[1-9]\d{7,14}$/;

export function normalizeWhapiTo(raw: string): string {
  const digits = raw.trim().replace(/\D/g, "");
  return digits;
}

export function assertWhapiTo(raw: string): string {
  const to = normalizeWhapiTo(raw);
  if (!WHAPI_TO_REGEX.test(to)) {
    throw new DomainError(
      "El teléfono WhatsApp del cliente debe incluir código de país (ej. 17135551234).",
    );
  }
  return to;
}

export function isWhapiConfigured(settings: {
  whapiEnabled?: boolean | null;
  whapiTokenEncrypted?: string | null;
}): boolean {
  return Boolean(settings.whapiEnabled && settings.whapiTokenEncrypted?.trim());
}

export function resolveWhapiBaseUrl(baseUrl?: string | null): string {
  const trimmed = baseUrl?.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_WHAPI_BASE_URL;
}

export interface WhapiSendInput {
  token: string;
  baseUrl?: string | null;
  to: string;
  body: string;
}

export interface WhapiSendResult {
  ok: true;
  status: number;
  messageId?: string;
}

/**
 * Envía texto vía Whapi.
 * @see https://support.whapi.cloud/help-desk/sending/send-text-message.md
 */
export async function sendWhapiText(
  input: WhapiSendInput,
): Promise<WhapiSendResult> {
  const token = input.token.trim();
  const body = input.body.trim();
  const to = assertWhapiTo(input.to);
  if (!token) {
    throw new DomainError("Falta el token de Whapi.");
  }
  if (!body) {
    throw new DomainError("El mensaje de WhatsApp no puede estar vacío.");
  }

  const url = `${resolveWhapiBaseUrl(input.baseUrl)}/messages/text`;
  let status = 0;
  let responseBody = "";
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, body }),
    });
    status = response.status;
    responseBody = (await response.text()).trim();
  } catch (error) {
    const reason = error instanceof Error ? error.name : "error";
    console.error("[whapi] fallo de red:", reason);
    throw new DomainError(
      "No se pudo contactar a Whapi. Revisa la conexión e inténtalo de nuevo.",
    );
  }

  if (status >= 400) {
    console.error("[whapi] rechazo HTTP", status);
    throw new DomainError(
      "Whapi rechazó el envío. Verifica el token, que el canal esté vinculado y el número del cliente.",
    );
  }

  let messageId: string | undefined;
  try {
    const parsed = JSON.parse(responseBody) as {
      message?: { id?: string };
      id?: string;
    };
    messageId = parsed.message?.id ?? parsed.id;
  } catch {
    // respuesta no JSON: ok si status 2xx
  }

  return { ok: true, status, messageId };
}

export function formatClientWhatsappMessage(input: {
  legalName: string;
  firstName: string | null | undefined;
  body: string;
  companyPhone?: string | null;
}): string {
  const name = input.firstName?.trim() || "hola";
  const lines = [
    `*${input.legalName}*`,
    `Hola ${name},`,
    "",
    input.body.trim(),
  ];
  if (input.companyPhone?.trim()) {
    lines.push("", input.companyPhone.trim());
  }
  return lines.join("\n");
}
