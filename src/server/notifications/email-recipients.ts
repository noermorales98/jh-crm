import { DomainError } from "@/src/server/errors";

export const MAX_EMAIL_RECIPIENTS = 10;

export function assertEmailRecipientCount(count: number) {
  if (count > MAX_EMAIL_RECIPIENTS) {
    throw new DomainError(
      `Puedes configurar hasta ${MAX_EMAIL_RECIPIENTS} correos de notificación.`,
    );
  }
}
