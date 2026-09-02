"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Modal,
  Textarea,
} from "@/src/components/ui";
import { playActionResult } from "@/src/lib/cuelume";
import { voidReceipt } from "@/src/actions/receipts";

/**
 * Anula un recibo (solo OWNER/ADMIN). Nunca borra el registro:
 * exige motivo y queda en la auditoría.
 */
export function VoidReceiptButton({
  receiptId,
  folio,
}: {
  receiptId: string;
  folio: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openModal() {
    setReason("");
    setError(null);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await voidReceipt(receiptId, { voidReason: reason });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openModal}>
        <Ban className="size-3.5" aria-hidden />
        Anular
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Anular recibo ${folio}`}
        description="La anulación no borra el recibo: queda marcado como anulado con fecha y motivo. El pago asociado no se modifica."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field
            label="Motivo de la anulación"
            htmlFor="void-reason"
            required
            hint="Mínimo 3 caracteres. Queda registrado en la auditoría."
          >
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={1000}
              placeholder="Ej. Recibo emitido con monto incorrecto."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Anulando…" : "Anular recibo"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
