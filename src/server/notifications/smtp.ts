import { decrypt } from "@/src/lib/security/encryption";

export type SmtpSettings = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPasswordEncrypted: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean;
};

export function isSmtpConfigured(s: SmtpSettings): boolean {
  return Boolean(s.smtpHost && s.smtpPort && s.smtpFrom);
}

export async function sendSmtpMail(
  settings: SmtpSettings,
  message: { to: string; subject: string; text: string },
): Promise<void> {
  if (!isSmtpConfigured(settings)) return;
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
  await transporter.sendMail({
    from: settings.smtpFrom!,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}
