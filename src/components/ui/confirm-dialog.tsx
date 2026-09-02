"use client";

import { useState, useTransition, type ReactNode } from "react";
import { play } from "cuelume";
import { Modal } from "./modal";
import { Button } from "./button";
import { Alert } from "./alert";

/**
 * ConfirmDialog: patrón de confirmación destructiva/neutra (client).
 * El trigger es `children` (se clona como botón) o se controla externamente.
 *
 * Uso con trigger propio:
 * <ConfirmDialog
 *   title="Archivar cliente"
 *   message="El cliente dejará de aparecer en las listas activas."
 *   confirmLabel="Archivar"
 *   danger
 *   onConfirm={async () => { const r = await archiveClient(id); return r.ok ? undefined : r.error; }}
 *   trigger={<Button variant="danger" size="sm">Archivar</Button>}
 * />
 *
 * onConfirm devuelve undefined/void en éxito o un string con el error a mostrar.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger,
  onConfirm,
  trigger,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<string | void>;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const failure = await onConfirm();
        if (failure) {
          play("error");
          setError(failure);
        } else {
          play("success");
          setOpen(false);
        }
      } catch {
        play("error");
        setError("Ocurrió un error inesperado. Intenta de nuevo.");
      }
    });
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {trigger}
      </span>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {cancelLabel}
            </Button>
            <Button
              variant={danger ? "danger" : "primary"}
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? "Procesando…" : confirmLabel}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-text-secondary-strong">{message}</div>
          {error ? <Alert tone="error">{error}</Alert> : null}
        </div>
      </Modal>
    </>
  );
}
