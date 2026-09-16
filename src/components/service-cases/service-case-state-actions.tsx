"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink, ConfirmDialog } from "@/src/components/ui";
import { transitionServiceCaseAction } from "@/src/actions/service-cases";

/**
 * Acciones de estado del expediente genérico (ServiceCaseStatus).
 * SC-004: al completar, ofrece solicitar testimonio.
 */
export function ServiceCaseStateActions({
  serviceCaseId,
  clientId,
  status,
}: {
  serviceCaseId: string;
  clientId: string;
  status: string;
}) {
  const router = useRouter();
  const [askTestimonial, setAskTestimonial] = useState(false);

  async function run(target: string): Promise<string | void> {
    const result = await transitionServiceCaseAction(serviceCaseId, target);
    if (!result.ok) return result.error;
    if (target === "COMPLETED") {
      setAskTestimonial(true);
    }
    router.refresh();
  }

  const testimoniosHref = `/crm/clientes/${clientId}/testimonios`;

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
          message="El expediente se marcará como completado. Después podrás solicitar un testimonio al cliente."
          confirmLabel="Completar"
          trigger={
            <Button variant="primary" size="sm">
              Completar
            </Button>
          }
          onConfirm={() => run("COMPLETED")}
        />
      ) : null}
      {status === "COMPLETED" || askTestimonial ? (
        <ButtonLink href={testimoniosHref} variant="secondary" size="sm">
          Solicitar testimonio
        </ButtonLink>
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
