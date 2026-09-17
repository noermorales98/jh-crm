"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui";
import {
  startConsultationCheckoutAction,
  updateConsultationStatusAction,
} from "@/src/actions/consultations";
import { playActionResult } from "@/src/lib/cuelume";
import type { ConsultationStatus } from "@prisma/client";

export function ConsultationStatusActions({
  consultationId,
  status,
  paymentConfigured,
}: {
  consultationId: string;
  status: ConsultationStatus;
  paymentConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(next: ConsultationStatus) {
    startTransition(async () => {
      const result = await updateConsultationStatusAction(consultationId, {
        status: next,
      });
      if (!result.ok) {
        playActionResult(false);
        return;
      }
      playActionResult(true);
      router.refresh();
    });
  }

  function chargeStripe() {
    startTransition(async () => {
      const result = await startConsultationCheckoutAction(consultationId);
      if (!result.ok) {
        playActionResult(false);
        window.alert(result.error);
        return;
      }
      playActionResult(true);
      window.location.href = result.data.url;
    });
  }

  if (status === "COMPLETED" || status === "CANCELLED") {
    return <span className="text-xs text-text-secondary">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {(status === "REQUESTED" || status === "PAYMENT_PENDING") &&
      paymentConfigured ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={chargeStripe}
        >
          Cobrar con Stripe
        </Button>
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
  );
}
