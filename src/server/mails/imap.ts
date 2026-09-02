import { decrypt } from "@/src/lib/security/encryption";
import { DomainError } from "@/src/server/errors";
import { decodeQuotedPrintable, embedCidImages } from "@/src/lib/mail/html";

const TRANSACTIONAL_HOSTS = [
  "sendgrid",
  "ses.",
  "amazonaws",
  "resend",
  "mailgun",
  "postmark",
  "sparkpost",
  "mailersend",
  "smtp.mailtrap",
];

export type InboundParsed = {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  messageId?: string | null;
  receivedAt?: Date;
};

/** Devuelve host IMAP conocido o null si el SMTP es solo transaccional. */
export function imapHostForSmtp(smtpHost: string): string | null {
  const host = smtpHost.trim().toLowerCase();
  if (!host) return null;
  if (TRANSACTIONAL_HOSTS.some((token) => host.includes(token))) return null;
  if (host.includes("gmail")) return "imap.gmail.com";
  if (
    host.includes("outlook") ||
    host.includes("office365") ||
    host.includes("hotmail") ||
    host.includes("live.com")
  ) {
    return "outlook.office365.com";
  }
  if (host.startsWith("imap.")) return smtpHost.trim();
  if (host.startsWith("smtp.")) return `imap.${smtpHost.trim().slice(5)}`;
  return smtpHost.trim();
}

function parseAddresses(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => parseAddresses(item));
  }
  if (typeof raw === "object" && raw !== null && "address" in raw) {
    const address = (raw as { address?: string }).address;
    return address ? [address.toLowerCase()] : [];
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,;]/)
      .map((part) => part.replace(/.*<([^>]+)>.*/, "$1").trim().toLowerCase())
      .filter((part) => part.includes("@"));
  }
  return [];
}

function formatFrom(envelopeFrom: unknown): string {
  if (Array.isArray(envelopeFrom) && envelopeFrom[0]) {
    return formatFrom(envelopeFrom[0]);
  }
  if (typeof envelopeFrom === "object" && envelopeFrom !== null) {
    const row = envelopeFrom as { name?: string; address?: string };
    if (row.address && row.name) return `${row.name} <${row.address}>`;
    if (row.address) return row.address;
  }
  if (typeof envelopeFrom === "string") return envelopeFrom;
  return "unknown@unknown";
}

/**
 * Descarga los últimos mensajes de INBOX. Si IMAP no responde, lanza
 * DomainError con un mensaje usable en la UI.
 */
export async function fetchImapInbox(input: {
  host: string;
  user: string;
  passwordEncrypted: string | null;
}): Promise<InboundParsed[]> {
  const password = input.passwordEncrypted
    ? decrypt(input.passwordEncrypted)
    : undefined;
  if (!password) {
    throw new DomainError(
      "Falta la contraseña SMTP. Guárdala en Configuración → Notificaciones para sincronizar IMAP.",
    );
  }

  try {
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host: input.host,
      port: 993,
      secure: true,
      auth: { user: input.user, pass: password },
      logger: false,
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
    });

    await client.connect();
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const mailbox = client.mailbox;
        if (!mailbox || typeof mailbox.exists !== "number" || mailbox.exists === 0) {
          return [];
        }
        const last = mailbox.exists;
        const first = Math.max(1, last - 49);
        const range = `${first}:${last}`;
        const messages: InboundParsed[] = [];
        const { simpleParser } = await import("mailparser");

        for await (const msg of client.fetch(range, {
          envelope: true,
          source: true,
          uid: true,
        })) {
          const envelope = msg.envelope;
          const source = msg.source;
          let text: string | undefined;
          let html: string | undefined;
          if (source && source.length > 0) {
            const parsed = await simpleParser(source);
            text = parsed.text?.trim() || undefined;
            const rawHtml =
              typeof parsed.html === "string" && parsed.html.trim()
                ? decodeQuotedPrintable(parsed.html)
                : undefined;
            html = rawHtml
              ? embedCidImages(
                  rawHtml,
                  parsed.attachments.flatMap((att) => {
                    const raw: unknown = att.content;
                    if (!Buffer.isBuffer(raw) || raw.length === 0) return [];
                    return [
                      {
                        contentId: att.contentId,
                        contentType: att.contentType,
                        content: raw,
                      },
                    ];
                  }),
                )
              : undefined;
          }
          messages.push({
            from: formatFrom(envelope?.from),
            to: parseAddresses(envelope?.to),
            cc: parseAddresses(envelope?.cc),
            subject: envelope?.subject?.trim() || "(Sin asunto)",
            text,
            html,
            messageId: envelope?.messageId ?? null,
            receivedAt: envelope?.date ?? undefined,
          });
        }
        return messages;
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    const detail = error instanceof Error ? error.message : "error desconocido";
    throw new DomainError(
      `No se pudo sincronizar IMAP (${input.host}): ${detail}`,
    );
  }
}
