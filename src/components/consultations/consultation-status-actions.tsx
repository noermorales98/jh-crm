"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Alert, Button } from "@/src/components/ui";
import {
  sendConsultationCheckoutWhatsappAction,
  startConsultationCheckoutAction,
  updateConsultationStatusAction,
} from "@/src/actions/consultations";
import { StripeCheckoutLinkBar } from "@/src/components/payments/stripe-checkout-link-bar";
import { playActionResult } from "@/src/lib/cuelume";
import type { ConsultationStatus } from "@prisma/client";

export function ConsultationStatusActions({
  consultationId,
  status,
  paymentConfigured,
  clientPhone,
}: {
  consultationId: string;
  status: ConsultationStatus;
  paymentConfigured: boolean;
  clientPhone?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const hasPhone = Boolean(clientPhone?.trim());

  function run(next: ConsultationStatus) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateConsultationStatusAction(consultationId, {
        status: next,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error ?? "No se pudo actualizar el estado.");
        return;
      }
      playActionResult(true);
      router.refresh();
    });
  }

  function chargeStripe() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await startConsultationCheckoutAction(consultationId);
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
      const result =
        await sendConsultationCheckoutWhatsappAction(consultationId);
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

  if (status === "COMPLETED" || status === "CANCELLED") {
    return <span className="text-xs text-text-secondary">—</span>;
  }

  const canCharge =
    (status === "REQUESTED" || status === "PAYMENT_PENDING") &&
    paymentConfigured;

  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
      <div className="flex flex-wrap items-center gap-1">
        {canCharge ? (
          <>
            <Button size="sm" disabled={pending} onClick={chargeStripe}>
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
              WhatsApp
            </Button>
          </>
        ) : null}
        {(status === "REQUESTED" ||
          status === "PAYMENT_PENDING" ||
          status === "PAID") && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run("SCHEDULED")}
          >
            Agendar
          </Button>
        )}
        {status === "SCHEDULED" || status === "REQUESTED" || status === "PAID" ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run("COMPLETED")}
          >
            Completar
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run("CANCELLED")}
        >
          Cancelar
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
