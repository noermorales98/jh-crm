"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button, Modal } from "@/src/components/ui";
import { DocumentUploader } from "@/src/components/documents/document-uploader";

/**
 * Botón que abre el wizard de documento (categoría → subir).
 * En páginas de expediente/documentos reemplaza el uploader inline.
 */
export function UploadDocumentButton({
  clientId,
  caseId,
  roundId,
  label = "Subir documento",
  menuItem = false,
}: {
  clientId: string;
  caseId?: string | null;
  roundId?: string;
  label?: string;
  menuItem?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {menuItem ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-nav-hover"
          onClick={() => setOpen(true)}
        >
          <FileUp className="size-3.5 shrink-0 text-text-secondary" aria-hidden />
          {label}
        </button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setOpen(true)}
        >
          <FileUp className="size-3.5" aria-hidden />
          {label}
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Subir documento"
        description="Primero elige el tipo; luego sube el archivo."
        size="md"
      >
        <DocumentUploader
          clientId={clientId}
          caseId={caseId ?? undefined}
          roundId={roundId}
          wizard
          onUploaded={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

/** @deprecated Prefer UploadDocumentButton */
export function QuickAddDocumentButton(
  props: Parameters<typeof UploadDocumentButton>[0],
) {
  return <UploadDocumentButton {...props} label={props.label ?? "+ Documento"} />;
}
