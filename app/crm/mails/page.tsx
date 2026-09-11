import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as mailService from "@/src/server/mails";
import {
  firstParam,
  parseEnumParam,
  clientFullName,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  ButtonLink,
  Card,
  CursorPagination,
  EmptyState,
  PageHeader,
  SearchInput,
} from "@/src/components/ui";
import { formatDateTime, formatRelative } from "@/src/lib/format";
import { MAIL_FOLDER_LABELS } from "@/src/lib/labels";
import { SyncInboxButton } from "@/src/components/mails/sync-inbox-button";

export const metadata: Metadata = {
  title: "Correos",
};

export default async function MailsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requirePermission("mails.view");
  const sp = await searchParams;
  const folderParam =
    parseEnumParam(firstParam(sp, "folder"), mailService.MAIL_FOLDER_PARAMS) ??
    "inbox";
  const folder = mailService.FOLDER_FROM_PARAM[folderParam];
  const q = firstParam(sp, "q");
  const cursor = firstParam(sp, "cursor");
  const canManage = can(ctx.role, "mails.manage");

  const [result, status] = await Promise.all([
    mailService.listMails(ctx, { folder, q, cursor }),
    mailService.smtpStatus(ctx),
  ]);

  return (
    <div>
      <PageHeader
        title={MAIL_FOLDER_LABELS[folder]}
        description="Bandeja compartida de la organización."
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <SearchInput
              placeholder="Buscar por asunto, remitente o texto…"
              defaultValue={q ?? ""}
            />
            {folderParam === "inbox" && canManage ? (
              <SyncInboxButton enabled={status.imapAvailable} />
            ) : null}
            {canManage ? (
              <ButtonLink href="/crm/mails/nuevo" size="sm">
                <Plus className="size-4" aria-hidden />
                Redactar
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <Card>
        {result.items.length === 0 ? (
          <EmptyState
            icon={Mail}
            title={`Sin correos en ${MAIL_FOLDER_LABELS[folder].toLowerCase()}`}
            description={
              q
                ? "Ningún correo coincide con la búsqueda."
                : folder === "INBOX"
                  ? status.configured
                    ? "Redacta un mensaje o sincroniza la bandeja si tu SMTP tiene IMAP."
                    : "Configura SMTP en Configuración → Notificaciones para enviar y recibir."
                  : "Esta carpeta está vacía."
            }
            action={
              canManage && !q && folder === "INBOX" ? (
                <ButtonLink href="/crm/mails/nuevo" size="sm">
                  <Plus className="size-4" aria-hidden />
                  Redactar
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {result.items.map((mail) => {
              const counterpart = mailService.counterpartLabel(mail);
              const when = mail.sentAt ?? mail.receivedAt ?? mail.createdAt;
              return (
                <li key={mail.id}>
                  <Link
                    href={`/crm/mails/${mail.id}?folder=${folderParam}`}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-nav-hover"
                  >
                    <span
                      className={`mt-2 size-2 shrink-0 rounded-full ${
                        mail.isRead ? "bg-transparent" : "bg-action-primary"
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-sm ${
                            mail.isRead
                              ? "font-medium text-ink"
                              : "font-semibold text-ink"
                          }`}
                        >
                          {counterpart}
                        </span>
                        <time
                          className="shrink-0 text-xs text-text-secondary"
                          dateTime={when.toISOString()}
                          title={formatDateTime(when)}
                        >
                          {formatRelative(when)}
                        </time>
                      </span>
                      <span
                        className={`mt-0.5 block truncate text-sm ${
                          mail.isRead ? "text-ink" : "font-medium text-ink"
                        }`}
                      >
                        {mail.subject}
                      </span>
                      {mail.client ? (
                        <span className="mt-0.5 block text-xs text-text-secondary">
                          {clientFullName(mail.client)} · {mail.client.clientCode}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <CursorPagination
          pathname="/crm/mails"
          params={{
            folder: folderParam,
            q,
            back: firstParam(sp, "back"),
          }}
          cursor={cursor}
          nextCursor={result.nextCursor}
        />
      </Card>
    </div>
  );
}
