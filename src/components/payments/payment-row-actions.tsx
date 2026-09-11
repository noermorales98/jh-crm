"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  Alert,
  Button,
  ConfirmDialog,
  DateInput,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import { playActionResult } from "@/src/lib/cuelume";
import {
  cancelPayment,
  refundPaymentRecord,
  updatePendingPayment,
} from "@/src/actions/payments";
import { PAYMENT_METHOD_LABELS } from "@/src/lib/labels";

export interface PaymentRowData {
  id: string;
  status: string;
  amount: string;
  method: string;
  reference: string;
  dueAt: string;
  notes: string;
}

/**
 * Acciones inline de un pago:
 * - PENDING: editar (modal) y cancelar (confirmación).
 * - RECEIVED: reembolsar (confirmación; anula el recibo asociado).
 */
export function PaymentRowActions({ payment }: { payment: PaymentRowData }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [values, setValues] = useState({
    amount: payment.amount,
    method: payment.method,
    reference: payment.reference,
    dueAt: payment.dueAt,
    notes: payment.notes,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openEdit() {
    setValues({
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      dueAt: payment.dueAt,
      notes: payment.notes,
    });
    setError(null);
    setEditOpen(true);
  }

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updatePendingPayment(payment.id, {
        amount: values.amount,
        method: values.method,
        reference: values.reference.trim() ? values.reference.trim() : null,
        dueAt: values.dueAt || null,
        notes: values.notes.trim() ? values.notes.trim() : null,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setEditOpen(false);
      router.refresh();
    });
  }

  if (payment.status === "PENDING") {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={openEdit}>
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </Button>
        <ConfirmDialog
          title="Cancelar pago pendiente"
          message="El pago pendiente quedará cancelado. Esta acción queda registrada en la auditoría."
          confirmLabel="Cancelar pago"
          danger
          trigger={
            <Button variant="ghost" size="sm">
              Cancelar
            </Button>
          }
          onConfirm={async () => {
            const result = await cancelPayment(payment.id);
            if (!result.ok) return result.error;
            router.refresh();
          }}
        />
        <Modal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="Editar pago pendiente"
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monto (USD)" htmlFor="edit-payment-amount" required>
                <Input
                  id="edit-payment-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={values.amount}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, amount: e.target.value }))
                  }
                  required
                />
              </Field>
              <Field label="Método" htmlFor="edit-payment-method">
                <Select
                  id="edit-payment-method"
                  value={values.method}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, method: e.target.value }))
                  }
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Vence" htmlFor="edit-payment-due" required>
                <DateInput
                  id="edit-payment-due"
                  value={values.dueAt}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, dueAt: e.target.value }))
                  }
                  required
                />
              </Field>
              <Field label="Referencia" htmlFor="edit-payment-reference">
                <Input
                  id="edit-payment-reference"
                  value={values.reference}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, reference: e.target.value }))
                  }
                  maxLength={200}
                />
              </Field>
            </div>
            <Field label="Notas" htmlFor="edit-payment-notes">
              <Textarea
                id="edit-payment-notes"
                value={values.notes}
                onChange={(e) =>
                  setValues((v) => ({ ...v, notes: e.target.value }))
                }
                maxLength={5000}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setEditOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  if (payment.status === "RECEIVED") {
    return (
      <ConfirmDialog
        title="Reembolsar pago"
        message={
          <>
            El pago pasará a <strong>Reembolsado</strong> y su recibo quedará{" "}
            <strong>anulado</strong>. Si está ligado a una cotización, su saldo
            se recalcula. Todo queda en la auditoría.
          </>
        }
        confirmLabel="Reembolsar"
        danger
        trigger={
          <Button variant="ghost" size="sm">
            Reembolsar
          </Button>
        }
        onConfirm={async () => {
          const result = await refundPaymentRecord(payment.id);
          if (!result.ok) return result.error;
          router.refresh();
        }}
      />
    );
  }

  return null;
}
