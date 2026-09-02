import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { DomainError } from "@/src/server/errors";
import * as mailService from "@/src/server/mails";
import {
  clientFullName,
  firstParam,
  parseEnumParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import { ButtonLink, Card, CardBody, CardHeader, PageHeader, Pill } from "@/src/components/ui";
import { formatDateTime } from "@/src/lib/format";
import { MAIL_FOLDER_LABELS } from "@/src/lib/labels";
import { MailActions } from "@/src/components/mails/mail-actions";
import { MailBody, MailViewProvider } from "@/src/components/mails/mail-content";
import { wrapEmailHtml } from "@/src/lib/mail/html";

export const metadata: Metadata = {
  title: "Correo",
};

export default async function MailDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ mailId: string }>;
  searchParams: SearchParams;
}) {
  const ctx = await requirePermission("mails.view");
  const { mailId } = await params;
  const sp = await searchParams;
  const folderParam =
    parseEnumParam(firstParam(sp, "folder"), mailService.MAIL_FOLDER_PARAMS) ??
    "inbox";

  let mail: Awaited<ReturnType<typeof mailService.getMail>>;
  try {
    mail = await mailService.getMail(ctx, mailId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  if (!mail.isRead && can(ctx.role, "mails.manage")) {
    await mailService.markRead(ctx, mail.id, true);
    mail = { ...mail, isRead: true };
  }

  const canManage = can(ctx.role, "mails.manage");
  const to = mailService.formatAddressList(mail.toAddresses);
  const cc = mailService.formatAddressList(mail.ccAddresses);
  const when = mail.sentAt ?? mail.receivedAt ?? mail.createdAt;
  const backFolder = mailService.PARAM_FROM_FOLDER[mail.folder] ?? folderParam;

  return (
    <MailViewProvider
      mailId={mail.id}
      translationSubject={mail.translationEsSubject}
      translationBody={mail.translationEsBody}
    >
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={mail.subject}
        description={MAIL_FOLDER_LABELS[mail.folder]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href={`/crm/mails?folder=${backFolder}`} variant="secondary" size="sm">
              Volver
            </ButtonLink>
            {canManage && mail.folder === "DRAFTS" ? (
              <ButtonLink href={`/crm/mails/nuevo?draftId=${mail.id}`} size="sm">
                Seguir redactando
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <Card>
        <CardHeader
          title={mail.direction === "INBOUND" ? "Correo recibido" : "Correo enviado"}
          actions={
            <MailActions
              mailId={mail.id}
              folder={mail.folder}
              isRead={mail.isRead}
              canManage={canManage}
            />
          }
        />
        <CardBody className="space-y-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
            <dt className="text-text-secondary">De</dt>
            <dd className="text-ink">
              {mail.fromName ? `${mail.fromName} ` : null}
              <span className="text-text-secondary-strong">&lt;{mail.fromAddress}&gt;</span>
            </dd>
            <dt className="text-text-secondary">Para</dt>
            <dd className="text-ink">{to || "—"}</dd>
            {cc ? (
              <>
                <dt className="text-text-secondary">CC</dt>
                <dd className="text-ink">{cc}</dd>
              </>
            ) : null}
            <dt className="text-text-secondary">Fecha</dt>
            <dd className="text-ink">{formatDateTime(when)}</dd>
            {mail.client ? (
              <>
                <dt className="text-text-secondary">Cliente</dt>
                <dd>
                  <Link
                    href={`/crm/clientes/${mail.client.id}`}
                    className="text-action-primary hover:text-action-secondary"
                  >
                    {clientFullName(mail.client)} ({mail.client.clientCode})
                  </Link>
                </dd>
              </>
            ) : null}
            <dt className="text-text-secondary">Estado</dt>
            <dd>
              {mail.direction === "INBOUND" ? (
                <Pill tone="blue">Entrante</Pill>
              ) : (
                <Pill tone="indigo">Saliente</Pill>
              )}
            </dd>
          </dl>

          <div className="border-t border-border-subtle pt-4">
            <MailBody
              srcDoc={mail.bodyHtml?.trim() ? wrapEmailHtml(mail.bodyHtml) : null}
              text={mail.bodyText}
            />
          </div>
        </CardBody>
      </Card>
    </div>
    </MailViewProvider>
  );
}
