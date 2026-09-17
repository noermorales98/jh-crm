"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button, Modal } from "@/src/components/ui";
import { DocumentUploader } from "@/src/components/documents/document-uploader";

/**
 * Abre un popup para elegir tipo y subir documento sin salir de la ficha.
 */
export function QuickAddDocumentButton({
  clientId,
  caseId,
  label = "+ Documento",
  menuItem = false,
}: {
  clientId: string;
  caseId?: string | null;
  label?: string;
  /** Estilo de ítem de menú (Agregar). */
  menuItem?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {menuItem ? (
        <button
          type="button"
          role="menuitem"
          className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-nav-hover"
          onClick={() => setOpen(true)}
        >
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
        title="Agregar documento"
        description="Elige el tipo y sube el archivo. Quedará en el expediente del cliente."
        size="md"
      >
        <DocumentUploader
          clientId={clientId}
          caseId={caseId ?? undefined}
        />
      </Modal>
    </>
  );
}
