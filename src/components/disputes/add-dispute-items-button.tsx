"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Textarea,
} from "@/src/components/ui";
import { addDisputeItemsBulk } from "@/src/actions/disputes";
import { playActionResult } from "@/src/lib/cuelume";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";
import { formatMoney } from "@/src/lib/format";

export type EligibleItem = {
  id: string;
  creditorName: string;
  accountNumberMasked: string | null;
  bureau: string;
  balance: string | null;
  isNegative: boolean;
};

export function AddDisputeItemsButton({
  roundId,
  eligible,
}: {
  roundId: string;
  eligible: EligibleItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("Selecciona al menos un elemento.");
      return;
    }
    startTransition(async () => {
      const result = await addDisputeItemsBulk({
        roundId,
        creditItemIds: [...selected],
        disputeReason: reason,
        ...(details.trim() ? { disputeDetails: details.trim() } : {}),
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      setSelected(new Set());
      setReason("");
      setDetails("");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        disabled={eligible.length === 0}
      >
        Añadir elementos
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Seleccionar elementos a disputar"
        description="Se usan los elementos del reporte más reciente del caso."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Motivo de disputa" htmlFor="dispute-reason" required>
            <Input
              id="dispute-reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="No es mi cuenta, información inexacta…"
            />
          </Field>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-control border border-border-subtle p-2">
            {eligible.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-3 rounded-control px-2 py-2 hover:bg-surface-panel"
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 rounded border-border-subtle text-action-primary"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-ink">{item.creditorName}</span>
                  <span className="mt-0.5 block text-xs text-text-secondary">
                    {CREDIT_BUREAU_LABELS[item.bureau] ?? item.bureau}
                    {item.accountNumberMasked
                      ? ` · ${item.accountNumberMasked}`
                      : ""}
                    {item.balance != null
                      ? ` · ${formatMoney(item.balance)}`
                      : ""}
                    {item.isNegative ? " · negativo" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Field label="Detalles" htmlFor="dispute-details">
            <Textarea
              id="dispute-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
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
              {pending ? "Guardando…" : `Añadir (${selected.size})`}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
