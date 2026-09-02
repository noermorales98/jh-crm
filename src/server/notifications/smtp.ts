import { decrypt } from "@/src/lib/security/encryption";
import { DomainError } from "@/src/server/errors";

export type SmtpSettings = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPasswordEncrypted: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean;
};

export type SmtpMessage = {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
};

export function isSmtpConfigured(s: SmtpSettings): boolean {
  return Boolean(s.smtpHost && s.smtpPort && s.smtpFrom);
}

export async function sendSmtpMail(
  settings: SmtpSettings,
  message: SmtpMessage,
  options?: { requireConfigured?: boolean },
): Promise<{ messageId?: string }> {
  if (!isSmtpConfigured(settings)) {
    if (options?.requireConfigured) {
      throw new DomainError(
        "El servidor SMTP no está configurado. Ve a Configuración → Notificaciones.",
      );
    }
    return {};
  }
  const nodemailer = await import("nodemailer");
  const password = settings.smtpPasswordEncrypted
    ? decrypt(settings.smtpPasswordEncrypted)
    : undefined;
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost!,
    port: settings.smtpPort!,
    secure: settings.smtpSecure && settings.smtpPort === 465,
    auth: settings.smtpUser
      ? { user: settings.smtpUser, pass: password }
      : undefined,
  });
  const info = await transporter.sendMail({
    from: settings.smtpFrom!,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    text: message.text,
    html: message.html,
    inReplyTo: message.inReplyTo,
    references: message.references,
  });
  return { messageId: info.messageId };
}
