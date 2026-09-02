import { DomainError } from "@/src/server/errors";
import { maskPhone } from "@/src/lib/security/redaction";
import type { CallmebotSendInput } from "./callmebot";

export const MAX_WHATSAPP_RECIPIENTS = 4;

export type WhatsappRecipientTarget = {
  id: string;
  enabled: boolean;
  phone: string;
  apiKeyEncrypted: string;
};

/** Filas a las que CallMeBot debe pegar: global on, activas, tope 4. */
export function selectWhatsappDeliveryTargets(input: {
  callmebotEnabled: boolean;
  recipients: WhatsappRecipientTarget[];
}): WhatsappRecipientTarget[] {
  if (!input.callmebotEnabled) return [];
  return input.recipients
    .filter((row) => row.enabled)
    .slice(0, MAX_WHATSAPP_RECIPIENTS);
}

export function assertRecipientCount(count: number) {
  if (count > MAX_WHATSAPP_RECIPIENTS) {
    throw new DomainError(
      `Puedes configurar hasta ${MAX_WHATSAPP_RECIPIENTS} números de WhatsApp.`,
    );
  }
}

export async function sendWhatsappToEach(
  recipients: Array<{ phone: string; apiKey: string }>,
  text: string,
  send: (input: CallmebotSendInput) => Promise<unknown>,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      await send({ phone: recipient.phone, apiKey: recipient.apiKey, text });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "[callmebot] destinatario falló:",
        maskPhone(recipient.phone),
        error instanceof Error ? error.message : "error",
      );
    }
  }
  return { sent, failed };
}
