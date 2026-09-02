import type { MailDirection, MailFolder, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import {
  isSmtpConfigured,
  sendSmtpMail,
} from "@/src/server/notifications/smtp";
import { parseAddressList } from "@/src/lib/validation/mail";
import { emailSchema } from "@/src/lib/validation/common";
import { fetchImapInbox, imapHostForSmtp } from "./imap";
import { decodeQuotedPrintable, looksQuotedPrintable } from "@/src/lib/mail/html";
import { createNotification } from "@/src/server/notifications";
import { translateEnglishToSpanish } from "@/src/lib/mail/translate";

export type MailFolderParam =
  | "inbox"
  | "sent"
  | "drafts"
  | "archive"
  | "spam"
  | "trash";

export const FOLDER_FROM_PARAM: Record<MailFolderParam, MailFolder> = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFTS",
  archive: "ARCHIVE",
  spam: "SPAM",
  trash: "TRASH",
};

export const PARAM_FROM_FOLDER: Record<MailFolder, MailFolderParam> = {
  INBOX: "inbox",
  SENT: "sent",
  DRAFTS: "drafts",
  ARCHIVE: "archive",
  SPAM: "spam",
  TRASH: "trash",
};

export const MAIL_FOLDER_PARAMS = Object.keys(
  FOLDER_FROM_PARAM,
) as MailFolderParam[];

export type MailComposeData = {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  clientId?: string | null;
  draftId?: string;
  inReplyToId?: string;
};

export type MailDraftData = {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  clientId?: string | null;
  draftId?: string;
};

export type MailListFilters = {
  folder?: MailFolder;
  q?: string;
  cursor?: string;
  limit?: number;
};

const MAIL_LIST_SELECT = {
  id: true,
  folder: true,
  direction: true,
  fromAddress: true,
  fromName: true,
  toAddresses: true,
  ccAddresses: true,
  subject: true,
  isRead: true,
  sentAt: true,
  receivedAt: true,
  archivedAt: true,
  createdAt: true,
  client: {
    select: { id: true, clientCode: true, firstName: true, lastName: true },
  },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MailMessageSelect;

function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function formatAddressList(value: Prisma.JsonValue | null | undefined): string {
  return asStringArray(value).join(", ");
}

export function parseFromField(from: string): { address: string; name: string | null } {
  const trimmed = from.trim();
  const angled = trimmed.match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  if (angled) {
    const name = angled[1]?.trim() || null;
    const address = angled[2].trim().toLowerCase();
    return { name, address };
  }
  return { name: null, address: trimmed.toLowerCase() };
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function getMailOrThrow(ctx: OrganizationContext, mailId: string) {
  const mail = await prisma.mailMessage.findFirst({
    where: { id: mailId, organizationId: ctx.organizationId },
  });
  if (!mail) throw new DomainError("Correo no encontrado.");
  return mail;
}

async function resolveClientId(
  ctx: OrganizationContext,
  clientId: string | null | undefined,
  emails: string[],
): Promise<string | null> {
  if (clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!client) throw new DomainError("El cliente enlazado no existe.");
    return client.id;
  }
  if (emails.length === 0) return null;
  const match = await prisma.client.findFirst({
    where: {
      organizationId: ctx.organizationId,
      email: { in: emails },
    },
    select: { id: true },
  });
  return match?.id ?? null;
}

async function smtpSettingsFor(organizationId: string) {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPasswordEncrypted: true,
      smtpFrom: true,
      smtpSecure: true,
      email: true,
      legalName: true,
    },
  });
  if (!settings) {
    throw new DomainError("No hay configuración de la organización.");
  }
  return settings;
}

async function smtpSettings(ctx: OrganizationContext) {
  return smtpSettingsFor(ctx.organizationId);
}

export async function countUnreadInbox(ctx: OrganizationContext): Promise<number> {
  return prisma.mailMessage.count({
    where: {
      organizationId: ctx.organizationId,
      folder: "INBOX",
      isRead: false,
    },
  });
}

export async function countByFolder(ctx: OrganizationContext) {
  const groups = await prisma.mailMessage.groupBy({
    by: ["folder"],
    where: { organizationId: ctx.organizationId },
    _count: { _all: true },
  });
  const unread = await prisma.mailMessage.groupBy({
    by: ["folder"],
    where: {
      organizationId: ctx.organizationId,
      isRead: false,
      folder: { in: ["INBOX", "ARCHIVE", "SPAM"] },
    },
    _count: { _all: true },
  });
  const totals: Record<MailFolder, { total: number; unread: number }> = {
    INBOX: { total: 0, unread: 0 },
    SENT: { total: 0, unread: 0 },
    DRAFTS: { total: 0, unread: 0 },
    ARCHIVE: { total: 0, unread: 0 },
    SPAM: { total: 0, unread: 0 },
    TRASH: { total: 0, unread: 0 },
  };
  for (const row of groups) {
    totals[row.folder].total = row._count._all;
  }
  for (const row of unread) {
    totals[row.folder].unread = row._count._all;
  }
  return totals;
}

export async function listMails(ctx: OrganizationContext, filters: MailListFilters = {}) {
  const limit = Math.min(filters.limit ?? 30, 100);
  const folder = filters.folder ?? "INBOX";
  const q = filters.q?.trim();

  const where: Prisma.MailMessageWhereInput = {
    organizationId: ctx.organizationId,
    folder,
    ...(q
      ? {
          OR: [
            { subject: { contains: q } },
            { fromAddress: { contains: q } },
            { fromName: { contains: q } },
            { bodyText: { contains: q } },
          ],
        }
      : {}),
  };

  const rows = await prisma.mailMessage.findMany({
    where,
    select: MAIL_LIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function getMail(ctx: OrganizationContext, mailId: string) {
  const mail = await prisma.mailMessage.findFirst({
    where: { id: mailId, organizationId: ctx.organizationId },
    include: {
      client: {
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      createdBy: { select: { id: true, name: true, email: true } },
      inReplyTo: { select: { id: true, subject: true } },
    },
  });
  if (!mail) throw new DomainError("Correo no encontrado.");
  return mail;
}

export async function markRead(
  ctx: OrganizationContext,
  mailId: string,
  isRead = true,
) {
  await getMailOrThrow(ctx, mailId);
  return prisma.mailMessage.update({
    where: { id: mailId },
    data: { isRead },
  });
}

export async function archiveMail(ctx: OrganizationContext, mailId: string) {
  const mail = await getMailOrThrow(ctx, mailId);
  if (mail.folder === "TRASH") {
    throw new DomainError("Restaura el correo de la papelera antes de archivarlo.");
  }
  if (mail.folder === "DRAFTS") {
    throw new DomainError("No se puede archivar un borrador. Envíalo o elimínalo.");
  }
  if (mail.folder === "ARCHIVE") return mail;
  return prisma.mailMessage.update({
    where: { id: mail.id },
    data: { folder: "ARCHIVE", archivedAt: new Date() },
  });
}

export async function unarchiveMail(ctx: OrganizationContext, mailId: string) {
  const mail = await getMailOrThrow(ctx, mailId);
  if (mail.folder !== "ARCHIVE") {
    throw new DomainError("Este correo no está archivado.");
  }
  return prisma.mailMessage.update({
    where: { id: mail.id },
    data: {
      folder: mail.direction === "OUTBOUND" ? "SENT" : "INBOX",
      archivedAt: null,
    },
  });
}

export async function markSpam(ctx: OrganizationContext, mailId: string) {
  const mail = await getMailOrThrow(ctx, mailId);
  if (mail.folder === "DRAFTS") {
    throw new DomainError("No se puede marcar un borrador como spam.");
  }
  if (mail.folder === "SPAM") return mail;
  return prisma.mailMessage.update({
    where: { id: mail.id },
    data: { folder: "SPAM", archivedAt: null },
  });
}

export async function unspamMail(ctx: OrganizationContext, mailId: string) {
  const mail = await getMailOrThrow(ctx, mailId);
  if (mail.folder !== "SPAM") {
    throw new DomainError("Este correo no está en spam.");
  }
  return prisma.mailMessage.update({
    where: { id: mail.id },
    data: {
      folder: mail.direction === "OUTBOUND" ? "SENT" : "INBOX",
    },
  });
}

export async function trashMail(ctx: OrganizationContext, mailId: string) {
  const mail = await getMailOrThrow(ctx, mailId);
  if (mail.folder === "TRASH") return mail;
  return prisma.mailMessage.update({
    where: { id: mail.id },
    data: { folder: "TRASH" },
  });
}

export async function restoreMail(ctx: OrganizationContext, mailId: string) {
  const mail = await getMailOrThrow(ctx, mailId);
  if (mail.folder !== "TRASH") {
    throw new DomainError("Este correo no está en la papelera.");
  }
  const folder: MailFolder =
    mail.direction === "OUTBOUND"
      ? mail.sentAt
        ? "SENT"
        : "DRAFTS"
      : "INBOX";
  return prisma.mailMessage.update({
    where: { id: mail.id },
    data: { folder, archivedAt: null },
  });
}

export async function deleteMailPermanently(ctx: OrganizationContext, mailId: string) {
  const mail = await getMailOrThrow(ctx, mailId);
  if (mail.folder !== "TRASH" && mail.folder !== "DRAFTS") {
    throw new DomainError("Mueve el correo a la papelera antes de eliminarlo.");
  }
  await prisma.mailMessage.delete({ where: { id: mail.id } });
  return { id: mail.id };
}

function quotedReply(original: {
  fromName: string | null;
  fromAddress: string;
  createdAt: Date;
  bodyText: string;
  subject: string;
}) {
  const who = original.fromName
    ? `${original.fromName} <${original.fromAddress}>`
    : original.fromAddress;
  const quoted = original.bodyText
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const subject = original.subject.startsWith("Re:")
    ? original.subject
    : `Re: ${original.subject}`;
  const when = new Intl.DateTimeFormat("es-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(original.createdAt);
  return {
    subject,
    body: `\n\n\nEl ${when}, ${who} escribió:\n${quoted}`,
  };
}

export function replyPrefill(mail: {
  direction: MailDirection;
  fromAddress: string;
  fromName: string | null;
  toAddresses: Prisma.JsonValue;
  subject: string;
  bodyText: string;
  createdAt: Date;
  clientId: string | null;
}) {
  const quoted = quotedReply(mail);
  const to =
    mail.direction === "INBOUND"
      ? mail.fromAddress
      : asStringArray(mail.toAddresses)[0] ?? "";
  return {
    to,
    subject: quoted.subject,
    body: quoted.body,
    clientId: mail.clientId,
  };
}

export async function saveDraft(ctx: OrganizationContext, data: MailDraftData) {
  const to = data.to?.trim()
    ? (() => {
        try {
          return parseAddressList(data.to);
        } catch {
          return [] as string[];
        }
      })()
    : [];
  const cc = data.cc?.trim()
    ? (() => {
        try {
          return parseAddressList(data.cc);
        } catch {
          return [] as string[];
        }
      })()
    : [];
  const settings = await smtpSettings(ctx);
  const from = parseFromField(settings.smtpFrom || settings.email || "");
  const clientId = await resolveClientId(ctx, data.clientId || null, [
    ...to,
    ...cc,
  ]);

  const payload = {
    folder: "DRAFTS" as const,
    direction: "OUTBOUND" as const,
    fromAddress: from.address || "sin-remitente@local",
    fromName: from.name,
    toAddresses: to,
    ccAddresses: cc,
    subject: data.subject?.trim() || "(Sin asunto)",
    bodyText: data.body ?? "",
    isRead: true,
    clientId,
    createdById: ctx.userId,
  };

  if (data.draftId) {
    const existing = await getMailOrThrow(ctx, data.draftId);
    if (existing.folder !== "DRAFTS") {
      throw new DomainError("Solo se pueden actualizar borradores.");
    }
    return prisma.mailMessage.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return prisma.mailMessage.create({
    data: {
      organizationId: ctx.organizationId,
      ...payload,
    },
  });
}

export async function sendMail(ctx: OrganizationContext, data: MailComposeData) {
  const settings = await smtpSettings(ctx);
  if (!isSmtpConfigured(settings)) {
    throw new DomainError(
      "El servidor SMTP no está configurado. Ve a Configuración → Notificaciones.",
    );
  }

  if (data.draftId) {
    const draft = await getMailOrThrow(ctx, data.draftId);
    if (draft.folder !== "DRAFTS") {
      throw new DomainError("Solo se puede enviar un borrador abierto.");
    }
  }

  const to = data.to;
  const cc = data.cc ?? [];
  if (to.length === 0) {
    throw new DomainError("Indica al menos un destinatario.");
  }

  const from = parseFromField(settings.smtpFrom!);
  const clientId = await resolveClientId(ctx, data.clientId ?? null, [...to, ...cc]);

  let inReplyToInternetId: string | undefined;
  if (data.inReplyToId) {
    const original = await getMailOrThrow(ctx, data.inReplyToId);
    inReplyToInternetId = original.internetMessageId ?? undefined;
  }

  const sent = await sendSmtpMail(
    settings,
    {
      to,
      cc: cc.length ? cc : undefined,
      subject: data.subject,
      text: data.body,
      inReplyTo: inReplyToInternetId,
      references: inReplyToInternetId,
    },
    { requireConfigured: true },
  );

  const now = new Date();
  const record = {
    folder: "SENT" as const,
    direction: "OUTBOUND" as const,
    fromAddress: from.address,
    fromName: from.name,
    toAddresses: to,
    ccAddresses: cc,
    subject: data.subject,
    bodyText: data.body,
    isRead: true,
    internetMessageId: sent.messageId ?? null,
    inReplyToId: data.inReplyToId ?? null,
    clientId,
    createdById: ctx.userId,
    sentAt: now,
  };

  const mail = await prisma.$transaction(async (tx) => {
    const created = data.draftId
      ? await tx.mailMessage.update({
          where: { id: data.draftId },
          data: record,
        })
      : await tx.mailMessage.create({
          data: { organizationId: ctx.organizationId, ...record },
        });

    if (clientId) {
      await writeActivityLog(
        toActivityContext(ctx),
        {
          type: "MAIL_SENT",
          description: `Correo enviado: ${data.subject}`,
          clientId,
          metadata: { mailId: created.id, toCount: to.length },
        },
        tx,
      );
    }
    return created;
  });

  return mail;
}

export async function recordInbound(
  organizationId: string,
  input: {
    from: string;
    to: string[] | string;
    cc?: string[] | string;
    subject: string;
    text?: string;
    html?: string;
    messageId?: string | null;
    receivedAt?: Date;
  },
) {
  const from = parseFromField(input.from);
  const to = Array.isArray(input.to)
    ? input.to.map((item) => emailSchema.parse(item))
    : parseAddressList(input.to);
  const cc = input.cc
    ? Array.isArray(input.cc)
      ? input.cc.map((item) => emailSchema.parse(item))
      : parseAddressList(input.cc)
    : [];
  const bodyText =
    input.text?.trim() ||
    (input.html ? htmlToText(input.html) : "") ||
    "(Sin contenido)";
  const internetMessageId = input.messageId?.trim() || null;

  if (internetMessageId) {
    const existing = await prisma.mailMessage.findFirst({
      where: { organizationId, internetMessageId },
      select: { id: true, bodyHtml: true, bodyText: true },
    });
    if (existing) {
      const html = input.html?.trim()
        ? decodeQuotedPrintable(input.html)
        : null;
      const nextText = input.text?.trim() || null;
      const shouldFillHtml =
        Boolean(html) &&
        (!existing.bodyHtml || looksQuotedPrintable(existing.bodyHtml));
      const shouldFillText =
        nextText &&
        (existing.bodyText === "(Sin contenido)" ||
          existing.bodyText === input.subject?.trim() ||
          existing.bodyText.length < nextText.length);
      if (shouldFillHtml || shouldFillText) {
        await prisma.mailMessage.update({
          where: { id: existing.id },
          data: {
            ...(shouldFillHtml ? { bodyHtml: html } : {}),
            ...(shouldFillText ? { bodyText: nextText } : {}),
          },
        });
      }
      return { id: existing.id, created: false };
    }
  }

  const client = await prisma.client.findFirst({
    where: {
      organizationId,
      email: { in: [from.address, ...to, ...cc] },
    },
    select: { id: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const mail = await tx.mailMessage.create({
      data: {
        organizationId,
        folder: "INBOX",
        direction: "INBOUND",
        fromAddress: from.address,
        fromName: from.name,
        toAddresses: to,
        ccAddresses: cc,
        subject: input.subject?.trim() || "(Sin asunto)",
        bodyText,
        bodyHtml: input.html?.trim()
          ? decodeQuotedPrintable(input.html)
          : null,
        isRead: false,
        internetMessageId,
        clientId: client?.id ?? null,
        receivedAt: input.receivedAt ?? new Date(),
      },
    });
    if (client) {
      await writeActivityLog(
        { organizationId, actorUserId: null },
        {
          type: "MAIL_RECEIVED",
          description: `Correo recibido: ${mail.subject}`,
          clientId: client.id,
          metadata: { mailId: mail.id },
        },
        tx,
      );
    }
    return mail;
  });

  await notifyNewInboundMail(organizationId, created).catch((error) => {
    console.error(
      "[mails] no se pudo notificar correo nuevo:",
      error instanceof Error ? error.message : "error",
    );
  });

  return { id: created.id, created: true };
}

export async function findOrganizationIdForRecipient(address: string): Promise<string | null> {
  const email = emailSchema.parse(address);
  const byEmail = await prisma.organizationSettings.findFirst({
    where: { email },
    select: { organizationId: true },
  });
  if (byEmail) return byEmail.organizationId;

  const all = await prisma.organizationSettings.findMany({
    where: { smtpFrom: { not: null } },
    select: { organizationId: true, smtpFrom: true },
  });
  for (const row of all) {
    if (!row.smtpFrom) continue;
    const parsed = parseFromField(row.smtpFrom);
    if (parsed.address === email) return row.organizationId;
  }
  return null;
}

export async function smtpStatus(ctx: OrganizationContext) {
  const settings = await smtpSettings(ctx);
  const configured = isSmtpConfigured(settings);
  const imapHost = settings.smtpHost ? imapHostForSmtp(settings.smtpHost) : null;
  return {
    configured,
    from: settings.smtpFrom ?? settings.email ?? null,
    imapAvailable: Boolean(configured && imapHost && settings.smtpUser),
  };
}

async function notifyNewInboundMail(
  organizationId: string,
  mail: {
    id: string;
    subject: string;
    fromName: string | null;
    fromAddress: string;
  },
) {
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: { in: ["OWNER", "ADMIN", "SPECIALIST", "STAFF"] },
      user: { isActive: true },
    },
    select: { userId: true },
  });
  if (members.length === 0) return;

  const from = mail.fromName
    ? `${mail.fromName} <${mail.fromAddress}>`
    : mail.fromAddress;
  const body = `De: ${from}\nAsunto: ${mail.subject}`;
  let sendWhatsapp = true;
  for (const member of members) {
    await createNotification({
      organizationId,
      userId: member.userId,
      type: "MAIL_RECEIVED",
      title: "Nuevo correo",
      body,
      link: `/crm/mails/${mail.id}?folder=inbox`,
      dedupeKey: `mail:${mail.id}:received:${member.userId}`,
      skipWhatsapp: !sendWhatsapp,
    });
    sendWhatsapp = false;
  }
}

export async function syncInboundForOrganization(organizationId: string) {
  const settings = await smtpSettingsFor(organizationId);
  if (!isSmtpConfigured(settings) || !settings.smtpUser) {
    throw new DomainError(
      "Configura SMTP (host, usuario y remitente) para sincronizar la bandeja.",
    );
  }
  const imapHost = imapHostForSmtp(settings.smtpHost!);
  if (!imapHost) {
    throw new DomainError(
      "Este servidor SMTP no tiene bandeja IMAP (p. ej. SendGrid o Amazon SES). Los correos enviados sí se guardan aquí.",
    );
  }

  const fetched = await fetchImapInbox({
    host: imapHost,
    user: settings.smtpUser,
    passwordEncrypted: settings.smtpPasswordEncrypted,
  });

  let created = 0;
  for (const message of fetched) {
    const result = await recordInbound(organizationId, message);
    if (result.created) created += 1;
  }
  return { fetched: fetched.length, created };
}

export async function syncInbound(ctx: OrganizationContext) {
  return syncInboundForOrganization(ctx.organizationId);
}

export async function translateMail(ctx: OrganizationContext, mailId: string) {
  const mail = await getMail(ctx, mailId);
  if (mail.translationEsBody && mail.translatedAt) {
    return {
      subject: mail.translationEsSubject || mail.subject,
      body: mail.translationEsBody,
    };
  }

  const translated = await translateEnglishToSpanish({
    subject: mail.subject,
    body: mail.bodyText,
  });

  const updated = await prisma.mailMessage.update({
    where: { id: mail.id },
    data: {
      translationEsSubject: translated.subject.slice(0, 500),
      translationEsBody: translated.body,
      translatedAt: new Date(),
    },
    select: {
      translationEsSubject: true,
      translationEsBody: true,
    },
  });

  return {
    subject: updated.translationEsSubject || mail.subject,
    body: updated.translationEsBody || translated.body,
  };
}

export function previewBody(text: string, max = 120): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max).trim()}…`;
}

export function counterpartLabel(mail: {
  direction: MailDirection;
  fromAddress: string;
  fromName: string | null;
  toAddresses: Prisma.JsonValue;
}): string {
  if (mail.direction === "INBOUND") {
    return mail.fromName || mail.fromAddress;
  }
  const to = asStringArray(mail.toAddresses);
  return to[0] ?? mail.fromAddress;
}
