"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  DateInput,
  Field,
  Input,
  Select,
  Textarea,
} from "@/src/components/ui";
import { registerPayment } from "@/src/actions/payments";
import { playActionResult } from "@/src/lib/cuelume";
import { PAYMENT_METHOD_LABELS } from "@/src/lib/labels";

export interface PaymentClientOption {
  id: string;
  label: string;
}

export interface PaymentCaseOption {
  id: string;
  caseCode: string;
  clientId: string;
}

export interface PaymentQuoteOption {
  id: string;
  folio: string;
  clientId: string;
  caseId: string | null;
  total: string;
  statusLabel: string;
}

// Zelle primero: es el método más usado por la operación.
const METHOD_ORDER = ["ZELLE", "STRIPE", "CASH", "BANK_TRANSFER", "OTHER"];

/**
 * Formulario de registro de pago manual.
 * - RECEIVED: genera automáticamente el recibo y actualiza el saldo de la cotización.
 * - PENDING: requiere fecha de vencimiento (dueAt); no genera recibo.
 */
export function PaymentForm({
  clients,
  cases,
  quotes,
  initialClientId = "",
  initialCaseId = "",
  initialQuoteId = "",
  defaultReceivedAt,
}: {
  clients: PaymentClientOption[];
  cases: PaymentCaseOption[];
  quotes: PaymentQuoteOption[];
  initialClientId?: string;
  initialCaseId?: string;
  initialQuoteId?: string;
  /** Hoy (YYYY-MM-DD) en la zona de la organización; lo calcula el server. */
  defaultReceivedAt: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId);
  const [caseId, setCaseId] = useState(initialCaseId);
  const [quoteId, setQuoteId] = useState(initialQuoteId);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("ZELLE");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState<"RECEIVED" | "PENDING">("RECEIVED");
  const [receivedAt, setReceivedAt] = useState(defaultReceivedAt);
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const clientCases = useMemo(
    () => cases.filter((c) => c.clientId === clientId),
    [cases, clientId],
  );
  const clientQuotes = useMemo(
    () => quotes.filter((q) => q.clientId === clientId),
    [quotes, clientId],
  );

  function handleClientChange(value: string) {
    setClientId(value);
    setCaseId((current) =>
      cases.some((c) => c.id === current && c.clientId === value) ? current : "",
    );
    setQuoteId((current) =>
      quotes.some((q) => q.id === current && q.clientId === value) ? current : "",
    );
  }

  function handleQuoteChange(value: string) {
    setQuoteId(value);
    const quote = quotes.find((q) => q.id === value);
    if (quote?.caseId) setCaseId(quote.caseId);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!clientId) {
      setError("Selecciona un cliente.");
      return;
    }
    if (status === "PENDING" && !dueAt) {
      setError("Un pago pendiente necesita fecha de vencimiento.");
      return;
    }
    startTransition(async () => {
      const result = await registerPayment({
        clientId,
        ...(caseId ? { caseId } : {}),
        ...(quoteId ? { quoteId } : {}),
        amount,
        method,
        status,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(status === "RECEIVED" && receivedAt ? { receivedAt } : {}),
        ...(status === "PENDING" && dueAt ? { dueAt } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      if (result.data.receiptFolio) {
        setSuccess(
          `Pago registrado. Se emitió automáticamente el recibo ${result.data.receiptFolio}.`,
        );
        setAmount("");
        setReference("");
        setNotes("");
        router.refresh();
      } else {
        router.push("/crm/pagos");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? (
        <Alert tone="success">
          {success}{" "}
          <a href="/crm/recibos" className="font-medium underline">
            Ver recibos
          </a>
          {" · "}
          <a href="/crm/pagos" className="font-medium underline">
            Ir a pagos
          </a>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente" htmlFor="payment-client" required>
          <Select
            id="payment-client"
            value={clientId}
            onChange={(e) => handleClientChange(e.target.value)}
            required
          >
            <option value="" disabled>
              Selecciona un cliente…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Caso (opcional)" htmlFor="payment-case">
          <Select
            id="payment-case"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            disabled={!clientId}
          >
            <option value="">Sin caso</option>
            {clientCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseCode}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Cotización (opcional)"
          htmlFor="payment-quote"
          hint="Si ligas una cotización, el pago actualiza su saldo."
        >
          <Select
            id="payment-quote"
            value={quoteId}
            onChange={(e) => handleQuoteChange(e.target.value)}
            disabled={!clientId}
          >
            <option value="">Sin cotización</option>
            {clientQuotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.folio} · {q.statusLabel} · ${q.total}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Monto (USD)" htmlFor="payment-amount" required>
          <Input
            id="payment-amount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="0.00"
          />
        </Field>
        <Field label="Método" htmlFor="payment-method" required>
          <Select
            id="payment-method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {METHOD_ORDER.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_METHOD_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Referencia / comprobante"
          htmlFor="payment-reference"
          hint="Ej. confirmación de Zelle, últimos dígitos, folio externo."
        >
          <Input
            id="payment-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={200}
          />
        </Field>
      </div>

      <Field label="Estado del pago" htmlFor="payment-status" required>
        <Select
          id="payment-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "RECEIVED" | "PENDING")}
        >
          <option value="RECEIVED">Recibido</option>
          <option value="PENDING">Pendiente</option>
        </Select>
      </Field>
      <Alert tone="info">
        {status === "RECEIVED"
          ? "Un pago recibido emite automáticamente un recibo con folio y actualiza el saldo de la cotización ligada."
          : "Un pago pendiente es un compromiso de pago: no genera recibo hasta que se registre como recibido."}
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        {status === "RECEIVED" ? (
          <Field label="Fecha de recepción" htmlFor="payment-received-at">
            <DateInput
              id="payment-received-at"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </Field>
        ) : (
          <Field label="Fecha de vencimiento" htmlFor="payment-due-at" required>
            <DateInput
              id="payment-due-at"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </Field>
        )}
        <Field label="Notas" htmlFor="payment-notes">
          <Textarea
            id="payment-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2 border-t border-border-subtle pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Registrando…" : "Registrar pago"}
        </Button>
        <Button variant="secondary" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
