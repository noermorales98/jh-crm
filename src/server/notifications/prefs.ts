import type { NotificationType } from "@prisma/client";

export type ChannelPrefs = {
  notifyEmailTask: boolean;
  notifyWhatsappTask: boolean;
  notifyEmailCase: boolean;
  notifyWhatsappCase: boolean;
  notifyEmailPayment: boolean;
  notifyWhatsappPayment: boolean;
  notifyEmailDigest: boolean;
  notifyWhatsappDigest: boolean;
  notifyEmailMail: boolean;
  notifyWhatsappMail: boolean;
  notifyEmailContact: boolean;
  notifyWhatsappContact: boolean;
  notifyEmailIntake: boolean;
  notifyWhatsappIntake: boolean;
};

export function emailEnabledFor(
  type: NotificationType,
  p: ChannelPrefs,
): boolean {
  if (type === "TASK_DUE" || type === "TASK_OVERDUE") return p.notifyEmailTask;
  if (type === "CASE_REVIEW_DUE" || type === "ROUND_REVIEW_DUE") {
    return p.notifyEmailCase;
  }
  if (type === "PAYMENT_DUE") return p.notifyEmailPayment;
  if (type === "DAILY_DIGEST") return p.notifyEmailDigest;
  if (type === "MAIL_RECEIVED") return p.notifyEmailMail;
  if (type === "CONTACT_FORM") return p.notifyEmailContact;
  if (type === "CONSULTATION_REQUESTED") return p.notifyEmailContact;
  if (type === "META_LEAD") return p.notifyEmailContact;
  if (type === "INTAKE_SUBMITTED") return p.notifyEmailIntake;
  return false;
}

export function whatsappEnabledFor(
  type: NotificationType,
  p: ChannelPrefs,
): boolean {
  if (type === "TASK_DUE" || type === "TASK_OVERDUE") return p.notifyWhatsappTask;
  if (type === "CASE_REVIEW_DUE" || type === "ROUND_REVIEW_DUE") {
    return p.notifyWhatsappCase;
  }
  if (type === "PAYMENT_DUE") return p.notifyWhatsappPayment;
  if (type === "DAILY_DIGEST") return p.notifyWhatsappDigest;
  // Correo recibido: solo campana/SMTP; nunca WhatsApp.
  if (type === "MAIL_RECEIVED") return false;
  if (type === "CONTACT_FORM") return p.notifyWhatsappContact;
  if (type === "CONSULTATION_REQUESTED") return p.notifyWhatsappContact;
  if (type === "META_LEAD") return p.notifyWhatsappContact;
  if (type === "INTAKE_SUBMITTED") return p.notifyWhatsappIntake;
  return false;
}
