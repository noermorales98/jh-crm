"use client";

import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/src/components/ui";
import { archiveClient } from "@/src/actions/clients";

/**
 * Acciones del expediente del cliente: archivar (ConfirmDialog destructivo).
 */
export function ClientActions({
  clientId,
  isArchived,
}: {
  clientId: string;
  currentAssigneeId?: string | null;
  isArchived: boolean;
  members?: { id: string; name: string }[];
}) {
  const router = useRouter();

  if (isArchived) return null;

  return (
    <ConfirmDialog
      title="Archivar cliente"
      message="El cliente quedará archivado y no aparecerá en las listas activas. Sus casos, documentos y pagos se conservan. Esta acción se puede revertir editando su estado."
      confirmLabel="Archivar"
      danger
      trigger={
        <Button variant="danger" size="sm">
          Archivar
        </Button>
      }
      onConfirm={async () => {
        const result = await archiveClient(clientId);
        if (!result.ok) return result.error;
        router.refresh();
      }}
    />
  );
}
