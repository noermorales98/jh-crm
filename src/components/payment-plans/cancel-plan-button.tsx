"use client";

import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/src/components/ui";
import { cancelPaymentPlanAction } from "@/src/actions/payment-plans";
import { playActionResult } from "@/src/lib/cuelume";

export function CancelPlanButton({ planId }: { planId: string }) {
  const router = useRouter();

  return (
    <ConfirmDialog
      title="Cancelar plan de pago"
      message="Se cancelarán las cuotas y pagos pendientes. Las cuotas ya pagadas no se modifican."
      confirmLabel="Cancelar plan"
      danger
      trigger={
        <Button variant="secondary" size="sm">
          Cancelar plan
        </Button>
      }
      onConfirm={async () => {
        const result = await cancelPaymentPlanAction(planId);
        if (!result.ok) {
          playActionResult(false);
          return result.error;
        }
        playActionResult(true);
        router.refresh();
      }}
    />
  );
}
