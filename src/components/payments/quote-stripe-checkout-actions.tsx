"use client";

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { Alert, Button } from "@/src/components/ui";
import { playActionResult } from "@/src/lib/cuelume";
import {
  sendQuoteCheckoutWhatsappAction,
  startQuoteCheckoutAction,
} from "@/src/actions/payments";
import { StripeCheckoutLinkBar } from "@/src/components/payments/stripe-checkout-link-bar";

/**
 * Generar / enviar link Stripe de una cotización (reutilizable en Cobrar y cliente).
 */
export function QuoteStripeCheckoutActions({
  quoteId,
  clientPhone,
  compact = false,
}: {
  quoteId: string;
  clientPhone?: string | null;
  compact?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hasPhone = Boolean(clientPhone?.trim());

  function generate() {
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

  function sendWa() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await sendQuoteCheckoutWhatsappAction(quoteId);
      if (!result.ok) {
        playActionResult(false);
        setError(result.error ?? "No se pudo enviar por WhatsApp.");
        return;
      }
      playActionResult(true);
      setCheckoutUrl(result.data.url);
      setSuccess(`Link enviado a ${result.data.to}.`);
    });
  }

  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant={compact ? "ghost" : "secondary"}
          disabled={pending}
          onClick={generate}
        >
          Link Stripe
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || !hasPhone}
          title={
            hasPhone
              ? "Enviar link por WhatsApp"
              : "El cliente no tiene teléfono"
          }
          onClick={sendWa}
        >
          <MessageCircle className="size-3.5" aria-hidden />
          {compact ? null : "WhatsApp"}
        </Button>
      </div>
      {checkoutUrl ? (
        <StripeCheckoutLinkBar
          url={checkoutUrl}
          onClear={() => {
            setCheckoutUrl(null);
            setSuccess(null);
          }}
        />
      ) : null}
    </div>
  );
}
