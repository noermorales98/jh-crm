import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { decrypt } from "@/src/lib/security/encryption";
import {
  formatWhatsappNotification,
  sendCallmebotMessage,
} from "./callmebot";

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
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: notification.organizationId },
    select: {
      callmebotEnabled: true,
      callmebotPhone: true,
      callmebotApiKeyEncrypted: true,
    },
  });
  if (
    !settings?.callmebotEnabled ||
    !settings.callmebotPhone ||
    !settings.callmebotApiKeyEncrypted
  ) {
    return;
  }

  let apiKey: string;
  try {
    apiKey = decrypt(settings.callmebotApiKeyEncrypted);
  } catch {
    console.error("[notifications] no se pudo descifrar el API key de CallMeBot.");
    return;
  }

  await sendCallmebotMessage({
    phone: settings.callmebotPhone,
    apiKey,
    text: formatWhatsappNotification({
      title: notification.title,
      body: notification.body,
      link: notification.link,
    }),
  });
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
