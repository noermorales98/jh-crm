"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/src/server/auth/guards";
import {
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  mailComposeSchema,
  mailDraftSchema,
  parseAddressList,
} from "@/src/lib/validation/mail";
import * as mailService from "@/src/server/mails";

function revalidateMails(mailId?: string) {
  revalidatePath("/crm/mails");
  revalidatePath("/mails");
  if (mailId) revalidatePath(`/crm/mails/${mailId}`);
}

export async function sendMail(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("mails.manage");
    const data = mailComposeSchema.parse(input);
    const mail = await mailService.sendMail(ctx, {
      to: parseAddressList(data.to),
      cc: data.cc ? parseAddressList(data.cc) : [],
      subject: data.subject,
      body: data.body,
      clientId: data.clientId || null,
      draftId: data.draftId,
      inReplyToId: data.inReplyToId,
    });
    revalidateMails(mail.id);
    return actionOk({ id: mail.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function saveDraft(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("mails.manage");
    const data = mailDraftSchema.parse(input);
    const mail = await mailService.saveDraft(ctx, {
      to: data.to || "",
      cc: data.cc || "",
      subject: data.subject || "",
      body: data.body || "",
      clientId: data.clientId || null,
      draftId: data.draftId,
    });
    revalidateMails(mail.id);
    return actionOk({ id: mail.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function archiveMail(
  mailId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("mails.manage");
    const id = cuidSchema.parse(mailId);
    const mail = await mailService.archiveMail(ctx, id);
    revalidateMails(mail.id);
    return actionOk({ id: mail.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function unarchiveMail(
  mailId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("mails.manage");
    const id = cuidSchema.parse(mailId);
    const mail = await mailService.unarchiveMail(ctx, id);
    revalidateMails(mail.id);
    return actionOk({ id: mail.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function markSpam(
  mailId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("mails.manage");
    const id = cuidSchema.parse(mailId);
    const mail = await mailService.markSpam(ctx, id);
    revalidateMails(mail.id);
    return actionOk({ id: mail.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function unspamMail(
  mailId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("mails.manage");
    const id = cuidSchema.parse(mailId);
    const mail = await mailService.unspamMail(ctx, id);
    revalidateMails(mail.id);
    return actionOk({ id: mail.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function trashMail(
  mailId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("mails.manage");
    const id = cuidSchema.parse(mailId);
    const mail = await mailService.trashMail(ctx, id);
    revalidateMails(mail.id);
    return actionOk({ id: mail.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function restoreMail(
  mailId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("mails.manage");
    const id = cuidSchema.parse(mailId);
    const mail = await mailService.restoreMail(ctx, id);
    revalidateMails(mail.id);
    return actionOk({ id: mail.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function deleteMailPermanently(
  mailId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("mails.manage");
    const id = cuidSchema.parse(mailId);
    const result = await mailService.deleteMailPermanently(ctx, id);
    revalidateMails();
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function markMailRead(
  mailId: string,
  isRead: boolean,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requirePermission("mails.manage");
    const id = cuidSchema.parse(mailId);
    const mail = await mailService.markRead(ctx, id, isRead);
    revalidateMails(mail.id);
    return actionOk({ id: mail.id });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function syncInbox(): Promise<
  ActionResult<{ fetched: number; created: number }>
> {
  try {
    const ctx = await requirePermission("mails.manage");
    const result = await mailService.syncInbound(ctx);
    revalidateMails();
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}

export async function translateMail(
  mailId: string,
): Promise<ActionResult<{ subject: string; body: string }>> {
  try {
    const ctx = await requirePermission("mails.view");
    const id = cuidSchema.parse(mailId);
    const result = await mailService.translateMail(ctx, id);
    revalidateMails(id);
    return actionOk(result);
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
