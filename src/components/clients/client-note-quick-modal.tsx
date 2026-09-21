"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Modal, Textarea } from "@/src/components/ui";
import {
  addClientNoteAction,
  addServiceCaseNoteAction,
} from "@/src/actions/notes";

/**
 * Modal inline para agregar nota desde Client 360 (sin navegar a /actividad).
 */
export function ClientNoteQuickModal({
  open,
  onClose,
  clientId,
  caseId,
  serviceCaseId,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  /** CreditCase id (ruta de crédito). */
  caseId: string | null;
  serviceCaseId: string | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClose() {
    if (pending) return;
    setBody("");
    setError(null);
    onClose();
  }

  function submit() {
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Escribe una nota.");
      return;
    }
    startTransition(async () => {
      const result =
        caseId || serviceCaseId
          ? await addServiceCaseNoteAction({
              caseId: caseId ?? undefined,
              serviceCaseId: caseId ? undefined : (serviceCaseId ?? undefined),
              body: trimmed,
            })
          : await addClientNoteAction({
              clientId,
              body: trimmed,
            });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody("");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Agregar nota"
      description="Queda registrada en el expediente activo."
    >
      <div className="space-y-3">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Escribe la nota…"
          aria-label="Texto de la nota"
          disabled={pending}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={pending}
          >
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
