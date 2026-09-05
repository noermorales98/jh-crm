"use client";

import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/src/components/ui";
import { cancelDisputeItem } from "@/src/actions/disputes";

export function CancelDisputeItemButton({
  disputeItemId,
  creditorName,
}: {
  disputeItemId: string;
  creditorName: string;
}) {
  const router = useRouter();

  return (
    <ConfirmDialog
      title="Quitar de la ronda"
      message={`¿Quitar «${creditorName}» de esta ronda?`}
      confirmLabel="Quitar"
      danger
      trigger={
        <Button size="sm" variant="ghost">
          Quitar
        </Button>
      }
      onConfirm={async () => {
        const result = await cancelDisputeItem(disputeItemId);
        if (!result.ok) return result.error;
        router.refresh();
      }}
    />
  );
}
