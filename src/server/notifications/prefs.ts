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
  return false;
}
