"use client";

import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Ban, MailOpen, Reply, Trash2 } from "lucide-react";
import { Button, ButtonLink, ConfirmDialog } from "@/src/components/ui";
import {
  archiveMail,
  deleteMailPermanently,
  markMailRead,
  markSpam,
  restoreMail,
  trashMail,
  unarchiveMail,
  unspamMail,
} from "@/src/actions/mails";
import type { ActionResult } from "@/src/server/errors";
import type { MailFolder } from "@prisma/client";
import { MailTranslateButton } from "@/src/components/mails/mail-content";

export function MailActions({
  mailId,
  folder,
  isRead,
  canManage,
}: {
  mailId: string;
  folder: MailFolder;
  isRead: boolean;
  canManage: boolean;
}) {
  const router = useRouter();

  async function run(
    action: (id: string) => Promise<ActionResult<{ id: string }>>,
    nextFolder?: string,
  ) {
    const result = await action(mailId);
    if (!result.ok) return result.error;
    router.push(nextFolder ? `/crm/mails?folder=${nextFolder}` : "/crm/mails");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canManage ? (
        <ButtonLink href={`/crm/mails/nuevo?replyTo=${mailId}`} variant="secondary" size="sm">
          <Reply className="size-4" aria-hidden />
          Responder
        </ButtonLink>
      ) : null}

      <MailTranslateButton />

      {canManage ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await markMailRead(mailId, !isRead);
            router.refresh();
          }}
        >
          <MailOpen className="size-4" aria-hidden />
          {isRead ? "No leído" : "Leído"}
        </Button>
      ) : null}

      {canManage && folder === "SPAM" ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await unspamMail(mailId);
            router.push("/crm/mails?folder=inbox");
            router.refresh();
          }}
        >
          No es spam
        </Button>
      ) : canManage && folder !== "TRASH" && folder !== "DRAFTS" ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await markSpam(mailId);
            router.push("/crm/mails?folder=spam");
            router.refresh();
          }}
        >
          <Ban className="size-4" aria-hidden />
          Spam
        </Button>
      ) : null}

      {canManage && folder === "ARCHIVE" ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await unarchiveMail(mailId);
            router.refresh();
          }}
        >
          <ArchiveRestore className="size-4" aria-hidden />
          Desarchivar
        </Button>
      ) : canManage && folder !== "TRASH" && folder !== "DRAFTS" ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await archiveMail(mailId);
            router.push("/crm/mails?folder=archive");
            router.refresh();
          }}
        >
          <Archive className="size-4" aria-hidden />
          Archivar
        </Button>
      ) : null}

      {canManage && folder === "TRASH" ? (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await restoreMail(mailId);
              router.push("/crm/mails");
              router.refresh();
            }}
          >
            Restaurar
          </Button>
          <ConfirmDialog
            title="Borrar definitivamente"
            message="El correo se borrará de forma permanente. Esta acción no se puede deshacer."
            confirmLabel="Borrar"
            danger
            trigger={
              <Button variant="danger" size="sm">
                <Trash2 className="size-4" aria-hidden />
                Borrar
              </Button>
            }
            onConfirm={() => run(deleteMailPermanently)}
          />
        </>
      ) : canManage ? (
        <ConfirmDialog
          title={folder === "DRAFTS" ? "Borrar borrador" : "Mover a papelera"}
          message={
            folder === "DRAFTS"
              ? "El borrador se borrará de forma permanente."
              : "El correo se moverá a la papelera. Podrás restaurarlo después."
          }
          confirmLabel={folder === "DRAFTS" ? "Borrar" : "Mover a papelera"}
          danger
          trigger={
            <Button variant="ghost" size="sm">
              <Trash2 className="size-4" aria-hidden />
              Borrar
            </Button>
          }
          onConfirm={() =>
            folder === "DRAFTS"
              ? run(deleteMailPermanently)
              : run(trashMail, "trash")
          }
        />
      ) : null}
    </div>
  );
}
