"use client";

import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/src/components/ui";
import { transitionServiceCaseAction } from "@/src/actions/service-cases";

/**
 * Fase 5 — acciones de estado del expediente genérico (ServiceCaseStatus):
 * OPEN → pausar / completar; ON_HOLD → reabrir / completar;
 * COMPLETED/CANCELED → reabrir.
 */
export function ServiceCaseStateActions({
  serviceCaseId,
  status,
}: {
  serviceCaseId: string;
  status: string;
}) {
  const router = useRouter();

  async function run(target: string): Promise<string | void> {
    const result = await transitionServiceCaseAction(serviceCaseId, target);
    if (!result.ok) return result.error;
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "OPEN" ? (
        <ConfirmDialog
          title="Pausar expediente"
          message="El expediente quedará en espera: seguirá visible pero marcado como inactivo temporalmente."
          confirmLabel="Pausar"
          trigger={
            <Button variant="secondary" size="sm">
              Pausar
            </Button>
          }
          onConfirm={() => run("ON_HOLD")}
        />
      ) : null}
      {status === "OPEN" || status === "ON_HOLD" ? (
        <ConfirmDialog
          title="Completar expediente"
          message="El expediente se marcará como completado y se cerrará. Podrás reabrirlo si es necesario."
          confirmLabel="Completar"
          trigger={
            <Button variant="primary" size="sm">
              Completar
            </Button>
          }
          onConfirm={() => run("COMPLETED")}
        />
      ) : null}
      {status !== "OPEN" ? (
        <ConfirmDialog
          title="Reabrir expediente"
          message="El expediente volverá al estado abierto."
          confirmLabel="Reabrir"
          trigger={
            <Button variant="secondary" size="sm">
              Reabrir
            </Button>
          }
          onConfirm={() => run("OPEN")}
        />
      ) : null}
    </div>
  );
}
