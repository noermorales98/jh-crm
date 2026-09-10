import { prisma } from "@/src/lib/db";
import { createNotification } from "@/src/server/notifications";
import { emailEnabledFor } from "@/src/server/notifications/prefs";
import { MAX_EMAIL_RECIPIENTS } from "@/src/server/notifications/email-recipients";
import { isSmtpConfigured, sendSmtpMail } from "@/src/server/notifications/smtp";

/**
 * Aviso al completar un intake público:
 * - Campana + WhatsApp: OWNER/ADMIN (WA una sola vez).
 * - Correo: lista configurable EmailNotificationRecipient (no User.email).
 */
export async function notifyIntakeSubmitted(
  organizationId: string,
  payload: {
    clientId: string;
    submissionId: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    documentCount: number;
  },
) {
  const fullName = [payload.firstName, payload.lastName].filter(Boolean).join(" ");
  const lines = [
    `Nombre: ${fullName}`,
    payload.email ? `Correo: ${payload.email}` : null,
    payload.phone ? `Teléfono: ${payload.phone}` : null,
    payload.documentCount > 0
      ? `Documentos: ${payload.documentCount}`
      : "Documentos: ninguno",
  ].filter(Boolean);
  const body = lines.join("\n");
  const link = `/crm/clientes/${payload.clientId}`;
  const title = "Nuevo registro de formulario";

  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: { in: ["OWNER", "ADMIN"] },
      user: { isActive: true },
    },
    select: { userId: true },
  });

  let sendWhatsapp = true;
  for (const member of members) {
    await createNotification({
      organizationId,
      userId: member.userId,
      type: "INTAKE_SUBMITTED",
      title,
      body,
      link,
      dedupeKey: `intake:${organizationId}:${payload.submissionId}:${member.userId}`,
      skipWhatsapp: !sendWhatsapp,
      skipEmail: true,
    });
    sendWhatsapp = false;
  }

  await deliverIntakeEmails(organizationId, {
    title,
    body,
    link,
  });
}

async function deliverIntakeEmails(
  organizationId: string,
  input: { title: string; body: string; link: string },
) {
  const [settings, recipients] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId },
    }),
    prisma.emailNotificationRecipient.findMany({
      where: { organizationId, enabled: true },
      orderBy: { sortOrder: "asc" },
      take: MAX_EMAIL_RECIPIENTS,
      select: { email: true },
    }),
  ]);
  if (!settings || !emailEnabledFor("INTAKE_SUBMITTED", settings)) return;
  if (!isSmtpConfigured(settings)) return;
  if (recipients.length === 0) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const href = input.link.startsWith("http")
    ? input.link
    : `${appUrl}${input.link}`;
  const text = [input.title, input.body, href].filter(Boolean).join("\n\n");
  const to = recipients.map((row) => row.email);

  await sendSmtpMail(settings, {
    to,
    subject: input.title,
    text,
  });
}
