import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { decrypt } from "@/src/lib/security/encryption";
import {
  formatWhatsappNotification,
  sendCallmebotMessage,
} from "./callmebot";
import {
  MAX_WHATSAPP_RECIPIENTS,
  selectWhatsappDeliveryTargets,
  sendWhatsappToEach,
} from "./whatsapp-recipients";

/**
 * Notificaciones in-app + WhatsApp (CallMeBot).
 * La idempotencia se logra con `dedupeKey` (create-or-update): el cron
 * puede ejecutarse varias veces sin duplicar avisos. WhatsApp solo se
 * dispara cuando la notificación es nueva.
 *
 * Ejemplos de dedupeKey:
 *   task:<taskId>:due
 *   case:<caseId>:review:<YYYY-MM-DD>
 *   round:<roundId>:review:<YYYY-MM-DD>
 *   payment:<paymentId>:due
 */

export interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
  skipWhatsapp?: boolean;
}

export async function createNotification(
  input: CreateNotificationInput,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? prisma;
  const { dedupeKey, skipWhatsapp, ...data } = input;

  if (dedupeKey) {
    const existing = await client.notification.findUnique({
      where: { dedupeKey },
    });
    if (existing) {
      return client.notification.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
        },
      });
    }
  }

  const created = await client.notification.create({
    data: { ...data, dedupeKey: dedupeKey ?? null },
  });

  // Fuera de transacción: si el cron hace rollback, no queremos WhatsApp huérfano.
  if (!tx && !skipWhatsapp) {
    await deliverWhatsapp(created).catch((error) => {
      console.error(
        "[notifications] WhatsApp no enviado:",
        error instanceof Error ? error.message : "error",
      );
    });
  }

  return created;
}

async function deliverWhatsapp(notification: {
  organizationId: string;
  title: string;
  body: string | null;
  link: string | null;
}) {
  const [settings, recipients] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId: notification.organizationId },
      select: { callmebotEnabled: true },
    }),
    prisma.whatsappRecipient.findMany({
      where: { organizationId: notification.organizationId },
      orderBy: { sortOrder: "asc" },
      take: MAX_WHATSAPP_RECIPIENTS,
      select: {
        id: true,
        enabled: true,
        phone: true,
        apiKeyEncrypted: true,
      },
    }),
  ]);

  const targets = selectWhatsappDeliveryTargets({
    callmebotEnabled: Boolean(settings?.callmebotEnabled),
    recipients,
  });
  if (targets.length === 0) return;

  const text = formatWhatsappNotification({
    title: notification.title,
    body: notification.body,
    link: notification.link,
  });

  const ready: Array<{ phone: string; apiKey: string }> = [];
  for (const target of targets) {
    try {
      ready.push({
        phone: target.phone,
        apiKey: decrypt(target.apiKeyEncrypted),
      });
    } catch {
      console.error(
        "[notifications] no se pudo descifrar el API key de CallMeBot.",
      );
    }
  }
  if (ready.length === 0) return;

  await sendWhatsappToEach(ready, text, sendCallmebotMessage);
}

export async function listNotificationsForUser(
  organizationId: string,
  userId: string,
  take = 20,
) {
  return prisma.notification.findMany({
    where: { organizationId, userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function countUnreadNotifications(
  organizationId: string,
  userId: string,
) {
  return prisma.notification.count({
    where: { organizationId, userId, isRead: false },
  });
}

export async function markNotificationRead(
  organizationId: string,
  userId: string,
  notificationId: string,
) {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, organizationId, userId },
    select: { id: true },
  });
  if (!existing) return null;
  return prisma.notification.update({
    where: { id: existing.id },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markAllNotificationsRead(
  organizationId: string,
  userId: string,
) {
  return prisma.notification.updateMany({
    where: { organizationId, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}
