"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import {
  Alert,
  Button,
  ButtonLink,
  ConfirmDialog,
} from "@/src/components/ui";
import { playActionResult } from "@/src/lib/cuelume";
import {
  cancelQuote,
  markQuoteAccepted,
  markQuoteRejected,
  markQuoteSent,
} from "@/src/actions/quotes";
import {
  sendQuoteCheckoutWhatsappAction,
  startQuoteCheckoutAction,
} from "@/src/actions/payments";
import { StripeCheckoutLinkBar } from "@/src/components/payments/stripe-checkout-link-bar";

/**
 * Acciones de una cotización según su estado:
 * - DRAFT: editar, enviar, aceptar, cancelar.
 * - SENT: aceptar, rechazar, cancelar, link Stripe.
 * - ACCEPTED/PARTIAL: registrar pago, link Stripe, cancelar.
 * Siempre: descargar PDF.
 */
export function QuoteActions({
  quoteId,
  status,
  clientId,
  clientPhone,
  folio,
}: {
  quoteId: string;
  status: string;
  clientId: string;
  clientPhone?: string | null;
  folio?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hasPhone = Boolean(clientPhone?.trim());

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        playActionResult(false);
        setError(result.error ?? "No se pudo completar la acción.");
        return;
      }
      playActionResult(true);
      router.refresh();
    });
  }

  function stripeCheckout() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await startQuoteCheckoutAction(quoteId);
      if (!result.ok) {
        playActionResult(false);
        setError(result.error ?? "No se pudo crear el link de Stripe.");
        return;
      }
      playActionResult(true);
      setCheckoutUrl(result.data.url);
    });
  }

  function sendStripeWhatsapp() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await sendQuoteCheckoutWhatsappAction(quoteId);
      if (!result.ok) {
        playActionResult(false);
        setError(result.error ?? "No se pudo enviar el link por WhatsApp.");
        return;
      }
      playActionResult(true);
      setCheckoutUrl(result.data.url);
      setSuccess(`Link enviado por WhatsApp a ${result.data.to}.`);
    });
  }

  const canRegisterPayment = ["ACCEPTED", "SENT", "PARTIAL", "DRAFT"].includes(
    status,
  );
  const canStripe = ["SENT", "ACCEPTED", "PARTIAL"].includes(status);

  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink
          href={`/api/quotes/${quoteId}/pdf`}
          variant="secondary"
          size="sm"
        >
          Descargar PDF
        </ButtonLink>
        {status === "DRAFT" ? (
          <>
            <ButtonLink
              href={`/crm/cotizaciones/nueva?edit=${quoteId}`}
              variant="secondary"
              size="sm"
            >
              Editar
            </ButtonLink>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => markQuoteSent(quoteId))}
            >
              Marcar enviada
            </Button>
          </>
        ) : null}
        {status === "DRAFT" || status === "SENT" ? (
          <Button
            size="sm"
            variant={status === "SENT" ? "primary" : "secondary"}
            disabled={pending}
            onClick={() => run(() => markQuoteAccepted(quoteId))}
          >
            Marcar aceptada
          </Button>
        ) : null}
        {status === "SENT" ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => markQuoteRejected(quoteId))}
          >
            Marcar rechazada
          </Button>
        ) : null}
        {canRegisterPayment ? (
          <ButtonLink
            href={`/crm/pagos/nuevo?clientId=${clientId}&quoteId=${quoteId}`}
            variant="secondary"
            size="sm"
          >
            Registrar pago
          </ButtonLink>
        ) : null}
        {canStripe ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={stripeCheckout}
            >
              Generar link Stripe
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !hasPhone}
              title={
                hasPhone
                  ? "Genera el link y lo envía al WhatsApp del cliente"
                  : "El cliente no tiene teléfono"
              }
              onClick={sendStripeWhatsapp}
            >
              <MessageCircle className="size-3.5" aria-hidden />
              Enviar link por WhatsApp
            </Button>
          </>
        ) : null}
        {["DRAFT", "SENT", "ACCEPTED", "PARTIAL"].includes(status) ? (
          <ConfirmDialog
            title="Cancelar cotización"
            message="La cotización quedará cancelada y no se podrá reactivar. Los pagos ya registrados no se modifican."
            confirmLabel="Cancelar cotización"
            danger
            trigger={
              <Button variant="danger" size="sm">
                Cancelar
              </Button>
            }
            onConfirm={async () => {
              const result = await cancelQuote(quoteId);
              if (!result.ok) return result.error;
              router.refresh();
            }}
          />
        ) : null}
      </div>
      {checkoutUrl ? (
        <StripeCheckoutLinkBar
          url={checkoutUrl}
          label={
            folio?.trim()
              ? `Cotización ${folio.trim()}`
              : "Cotización · pago Stripe"
          }
          onClear={() => {
            setCheckoutUrl(null);
            setSuccess(null);
          }}
        />
      ) : null}
    </div>
  );
}
