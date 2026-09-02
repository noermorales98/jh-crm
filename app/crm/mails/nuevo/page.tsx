import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/src/server/auth/guards";
import { DomainError } from "@/src/server/errors";
import * as mailService from "@/src/server/mails";
import * as clientService from "@/src/server/clients";
import {
  clientFullName,
  firstParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import { Card, CardBody, PageHeader } from "@/src/components/ui";
import { ComposeMailForm } from "@/src/components/mails/compose-mail-form";
import { formatAddressList } from "@/src/server/mails";

export const metadata: Metadata = {
  title: "Redactar correo",
};

export default async function NewMailPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requirePermission("mails.manage");
  const sp = await searchParams;
  const replyTo = firstParam(sp, "replyTo");
  const draftId = firstParam(sp, "draftId");

  const [clientsResult, status] = await Promise.all([
    clientService.listClients(ctx, { limit: 100 }),
    mailService.smtpStatus(ctx),
  ]);

  const clients = clientsResult.items
    .filter((c) => c.status !== "ARCHIVED")
    .map((c) => ({
      id: c.id,
      label: `${clientFullName(c)} (${c.clientCode})`,
      email: c.email,
    }));

  let initial:
    | {
        draftId?: string;
        inReplyToId?: string;
        to?: string;
        cc?: string;
        subject?: string;
        body?: string;
        clientId?: string | null;
      }
    | undefined;

  if (draftId) {
    try {
      const draft = await mailService.getMail(ctx, draftId);
      if (draft.folder !== "DRAFTS") notFound();
      initial = {
        draftId: draft.id,
        to: formatAddressList(draft.toAddresses),
        cc: formatAddressList(draft.ccAddresses),
        subject: draft.subject === "(Sin asunto)" ? "" : draft.subject,
        body: draft.bodyText,
        clientId: draft.clientId,
      };
    } catch (error) {
      if (error instanceof DomainError) notFound();
      throw error;
    }
  } else if (replyTo) {
    try {
      const original = await mailService.getMail(ctx, replyTo);
      const prefill = mailService.replyPrefill(original);
      initial = {
        inReplyToId: original.id,
        to: prefill.to,
        subject: prefill.subject,
        body: prefill.body,
        clientId: prefill.clientId,
      };
    } catch (error) {
      if (error instanceof DomainError) notFound();
      throw error;
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={draftId ? "Editar borrador" : replyTo ? "Responder" : "Redactar correo"}
        description="El envío usa el SMTP de la organización. Una copia queda en Enviados."
      />
      <Card>
        <CardBody>
          <ComposeMailForm
            clients={clients}
            smtpConfigured={status.configured}
            initial={initial}
          />
        </CardBody>
      </Card>
    </div>
  );
}
