"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Alert,
  Button,
  DateInput,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import { createPaymentPlanAction } from "@/src/actions/payment-plans";
import { playActionResult } from "@/src/lib/cuelume";
import {
  PAYMENT_PLAN_FREQUENCY_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { PAYMENT_PLAN_FREQUENCIES } from "@/src/lib/validation/payment-plans";

type ClientOption = {
  id: string;
  label: string;
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function CreatePlanButton({
  clients,
  defaultClientId,
}: {
  clients: ClientOption[];
  defaultClientId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(defaultClientId ?? clients[0]?.id ?? "");
  const [totalAmount, setTotalAmount] = useState("");
  const [numberOfInstallments, setNumberOfInstallments] = useState("3");
  const [frequency, setFrequency] = useState<(typeof PAYMENT_PLAN_FREQUENCIES)[number]>("MONTHLY");
  const [startDate, setStartDate] = useState(todayInputValue());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (clients.length === 0) {
    return (
      <Button size="sm" disabled title="Necesitas al menos un cliente">
        <Plus className="size-4" aria-hidden />
        Nuevo plan
      </Button>
    );
  }

  function openModal() {
    setClientId(defaultClientId ?? clients[0]?.id ?? "");
    setTotalAmount("");
    setNumberOfInstallments("3");
    setFrequency("MONTHLY");
    setStartDate(todayInputValue());
    setNotes("");
    setError(null);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createPaymentPlanAction({
        clientId,
        totalAmount,
        numberOfInstallments: Number(numberOfInstallments),
        frequency,
        startDate,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      router.push(`/crm/planes-pago/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={openModal}>
        <Plus className="size-4" aria-hidden />
        Nuevo plan
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo plan de pago"
        description="Se crearán cuotas con pagos pendientes asociados."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Cliente" htmlFor="plan-client" required>
            <Select
              id="plan-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monto total (USD)" htmlFor="plan-total" required>
              <Input
                id="plan-total"
                type="number"
                min="0.01"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="Número de cuotas" htmlFor="plan-n" required>
              <Input
                id="plan-n"
                type="number"
                min={2}
                max={60}
                value={numberOfInstallments}
                onChange={(e) => setNumberOfInstallments(e.target.value)}
                required
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Frecuencia" htmlFor="plan-freq" required>
              <Select
                id="plan-freq"
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as (typeof PAYMENT_PLAN_FREQUENCIES)[number])
                }
              >
                {PAYMENT_PLAN_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {labelFor(PAYMENT_PLAN_FREQUENCY_LABELS, f)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha de inicio" htmlFor="plan-start" required>
              <DateInput
                id="plan-start"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Notas" htmlFor="plan-notes">
            <Textarea
              id="plan-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear plan"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
