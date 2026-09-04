"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { addCreditItem } from "@/src/actions/credit-reports";
import { playActionResult } from "@/src/lib/cuelume";
import {
  CREDIT_BUREAU_LABELS,
  CREDIT_NEGATIVE_TYPE_LABELS,
} from "@/src/lib/labels";

/**
 * Modal para añadir un elemento/cuenta a un reporte de crédito.
 */
export function AddCreditItemButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creditorName, setCreditorName] = useState("");
  const [accountNumberMasked, setAccountNumberMasked] = useState("");
  const [accountType, setAccountType] = useState("");
  const [bureau, setBureau] = useState<"EXPERIAN" | "EQUIFAX" | "TRANSUNION">(
    "EXPERIAN",
  );
  const [balance, setBalance] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [negativeType, setNegativeType] = useState("");
  const [isNegative, setIsNegative] = useState(true);
  const [remarks, setRemarks] = useState("");
  const [dateOpened, setDateOpened] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setCreditorName("");
    setAccountNumberMasked("");
    setAccountType("");
    setBureau("EXPERIAN");
    setBalance("");
    setAccountStatus("");
    setPaymentStatus("");
    setNegativeType("");
    setIsNegative(true);
    setRemarks("");
    setDateOpened("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addCreditItem({
        reportId,
        creditorName,
        bureau,
        isNegative,
        ...(accountNumberMasked.trim()
          ? { accountNumberMasked: accountNumberMasked.trim() }
          : {}),
        ...(accountType.trim() ? { accountType: accountType.trim() } : {}),
        ...(balance ? { balance } : {}),
        ...(accountStatus.trim() ? { accountStatus: accountStatus.trim() } : {}),
        ...(paymentStatus.trim() ? { paymentStatus: paymentStatus.trim() } : {}),
        ...(negativeType
          ? { negativeType: negativeType as keyof typeof CREDIT_NEGATIVE_TYPE_LABELS }
          : {}),
        ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
        ...(dateOpened ? { dateOpened } : {}),
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Añadir elemento
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Añadir elemento de crédito"
        description="Usa solo números de cuenta enmascarados (ej. ****1234)."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Acreedor" htmlFor="ci-creditor" required>
            <Input
              id="ci-creditor"
              required
              value={creditorName}
              onChange={(e) => setCreditorName(e.target.value)}
              maxLength={200}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Buró" htmlFor="ci-bureau">
              <Select
                id="ci-bureau"
                value={bureau}
                onChange={(e) =>
                  setBureau(e.target.value as typeof bureau)
                }
              >
                {Object.entries(CREDIT_BUREAU_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cuenta (enmascarada)" htmlFor="ci-acct">
              <Input
                id="ci-acct"
                value={accountNumberMasked}
                onChange={(e) => setAccountNumberMasked(e.target.value)}
                placeholder="****1234"
                maxLength={32}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de cuenta" htmlFor="ci-type">
              <Input
                id="ci-type"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                placeholder="Revolving, Installment…"
                maxLength={80}
              />
            </Field>
            <Field label="Saldo" htmlFor="ci-balance">
              <Input
                id="ci-balance"
                type="number"
                step="0.01"
                min={0}
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Estado de cuenta" htmlFor="ci-acct-status">
              <Input
                id="ci-acct-status"
                value={accountStatus}
                onChange={(e) => setAccountStatus(e.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="Estado de pago" htmlFor="ci-pay-status">
              <Input
                id="ci-pay-status"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                maxLength={120}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo negativo" htmlFor="ci-neg">
              <Select
                id="ci-neg"
                value={negativeType}
                onChange={(e) => {
                  setNegativeType(e.target.value);
                  if (e.target.value) setIsNegative(true);
                }}
              >
                <option value="">—</option>
                {Object.entries(CREDIT_NEGATIVE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha apertura" htmlFor="ci-opened">
              <DateInput
                id="ci-opened"
                value={dateOpened}
                onChange={(e) => setDateOpened(e.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary-strong">
            <input
              type="checkbox"
              checked={isNegative}
              onChange={(e) => setIsNegative(e.target.checked)}
              className="size-4 rounded border-border-subtle"
            />
            Marcar como negativo
          </label>
          <Field label="Observaciones" htmlFor="ci-remarks">
            <Textarea
              id="ci-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
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
              {pending ? "Guardando…" : "Añadir"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
