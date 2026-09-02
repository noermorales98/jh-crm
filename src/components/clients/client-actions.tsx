"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  ConfirmDialog,
  Field,
  Modal,
  Select,
} from "@/src/components/ui";
import { archiveClient, assignClient } from "@/src/actions/clients";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * Acciones del expediente del cliente: asignar responsable (modal)
 * y archivar (ConfirmDialog destructivo).
 */
export function ClientActions({
  clientId,
  currentAssigneeId,
  isArchived,
  members,
}: {
  clientId: string;
  currentAssigneeId: string | null;
  isArchived: boolean;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState(currentAssigneeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await assignClient(clientId, {
        assignedToId: assigneeId || null,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setAssignOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAssignOpen(true)}>
        Asignar responsable
      </Button>
      {!isArchived ? (
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
      ) : null}

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Asignar responsable"
      >
        <form onSubmit={handleAssign} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Responsable" htmlFor="assignee">
            <Select
              id="assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setAssignOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Asignar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
