"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { play } from "cuelume";
import {
  Alert,
  Button,
  Field,
  Input,
} from "@/src/components/ui";
import { wipeOrganizationDataAction } from "@/src/actions/config";
import {
  WIPE_CONFIRMATION_PHRASE,
  type WipePreviewCounts,
} from "@/src/lib/config/wipe-constants";

const COUNT_LABELS: { key: keyof WipePreviewCounts; label: string }[] = [
  { key: "clients", label: "Clientes" },
  { key: "opportunities", label: "Leads" },
  { key: "serviceCases", label: "Expedientes" },
  { key: "creditCases", label: "Casos de crédito" },
  { key: "quotes", label: "Cotizaciones" },
  { key: "payments", label: "Pagos" },
  { key: "documents", label: "Documentos" },
  { key: "mails", label: "Correos" },
  { key: "tasks", label: "Tareas" },
  { key: "chats", label: "Chats" },
];

export function WipeOrgDataPanel({
  initialCounts,
}: {
  initialCounts: WipePreviewCounts;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirmed = confirmation.trim() === WIPE_CONFIRMATION_PHRASE;
  const total = Object.values(initialCounts).reduce((sum, n) => sum + n, 0);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await wipeOrganizationDataAction(confirmation);
      if (!result.ok) {
        play("error");
        setError(result.error);
        return;
      }
      play("success");
      setConfirmation("");
      setSuccess(
        total === 0
          ? "No había datos operativos que borrar."
          : "Se borró el contenido operativo. Usuarios, catálogo y configuración se conservan.",
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Alert tone="error">
        Esta acción es permanente. Se eliminan clientes, leads, casos, pagos,
        documentos, correos y el resto del historial operativo. No se puede
        deshacer.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Se borra</h3>
          <ul className="mt-2 space-y-1 text-[13px] text-text-secondary-strong">
            {COUNT_LABELS.map(({ key, label }) => (
              <li key={key} className="flex justify-between gap-3">
                <span>{label}</span>
                <span className="tabular-nums text-ink">{initialCounts[key]}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Se conserva</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] text-text-secondary-strong">
            <li>Usuarios y roles</li>
            <li>Datos de la empresa y notificaciones</li>
            <li>Catálogo de servicios y paquetes</li>
            <li>Etapas del proceso</li>
            <li>Plantillas y procesadores</li>
          </ul>
        </div>
      </div>

      <Field
        label={`Escribe ${WIPE_CONFIRMATION_PHRASE} para confirmar`}
        htmlFor="wipe-confirmation"
        required
        hint="Mayúsculas, tal cual aparece. Los folios de cliente, caso, cotización y recibo vuelven a empezar."
      >
        <Input
          id="wipe-confirmation"
          name="confirmation"
          autoComplete="off"
          spellCheck={false}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={WIPE_CONFIRMATION_PHRASE}
          disabled={pending}
        />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      <Button type="submit" variant="danger" disabled={!confirmed || pending}>
        {pending ? "Borrando…" : "Borrar todo el contenido"}
      </Button>
    </form>
  );
}
