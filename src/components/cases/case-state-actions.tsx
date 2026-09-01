"use client";

import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/src/components/ui";
import {
  completeCase,
  pauseCase,
  reopenCase,
} from "@/src/actions/cases";

/**
 * Acciones de estado del caso según su estado actual:
 * OPEN → pausar / completar; PAUSED → reabrir / completar;
 * COMPLETED/CANCELLED → reabrir.
 */
export function CaseStateActions({
  caseId,
  state,
}: {
  caseId: string;
  state: string;
}) {
  const router = useRouter();

  async function run(
    action: (id: string) => Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }>,
  ): Promise<string | void> {
    const result = await action(caseId);
    if (!result.ok) return result.error;
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "OPEN" ? (
        <ConfirmDialog
          title="Pausar caso"
          message="El caso quedará pausado: seguirá visible pero marcado como inactivo temporalmente."
          confirmLabel="Pausar"
          trigger={<Button variant="secondary" size="sm">Pausar</Button>}
          onConfirm={() => run(pauseCase)}
        />
      ) : null}
      {state === "OPEN" || state === "PAUSED" ? (
        <ConfirmDialog
          title="Completar caso"
          message="El caso se marcará como completado y se cerrará. Podrás reabrirlo si es necesario."
          confirmLabel="Completar"
          trigger={<Button variant="primary" size="sm">Completar</Button>}
          onConfirm={() => run(completeCase)}
        />
      ) : null}
      {state !== "OPEN" ? (
        <ConfirmDialog
          title="Reabrir caso"
          message="El caso volverá al estado abierto."
          confirmLabel="Reabrir"
          trigger={<Button variant="secondary" size="sm">Reabrir</Button>}
          onConfirm={() => run(reopenCase)}
        />
      ) : null}
    </div>
  );
}
