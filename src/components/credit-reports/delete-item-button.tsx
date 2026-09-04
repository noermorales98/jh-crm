"use client";

import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/src/components/ui";
import { deleteCreditItem } from "@/src/actions/credit-reports";

export function DeleteCreditItemButton({
  itemId,
  creditorName,
}: {
  itemId: string;
  creditorName: string;
}) {
  const router = useRouter();

  return (
    <ConfirmDialog
      title="Eliminar elemento"
      message={`¿Eliminar «${creditorName}» de este reporte? Esta acción no se puede deshacer.`}
      confirmLabel="Eliminar"
      danger
      trigger={
        <Button size="sm" variant="ghost">
          Eliminar
        </Button>
      }
      onConfirm={async () => {
        const result = await deleteCreditItem(itemId);
        if (!result.ok) return result.error;
        router.refresh();
      }}
    />
  );
}
