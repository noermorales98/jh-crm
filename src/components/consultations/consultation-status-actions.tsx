"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui";
import { updateConsultationStatusAction } from "@/src/actions/consultations";
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

  if (status === "COMPLETED" || status === "CANCELLED") {
    return <span className="text-xs text-text-secondary">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {status === "REQUESTED" && paymentConfigured ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => run("PAYMENT_PENDING")}
        >
          Pago pendiente
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
