"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, DateInput } from "@/src/components/ui";
import { setNextActionAt } from "@/src/actions/cases";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * Editor inline de la próxima acción operativa del expediente.
 * SC-003: ServiceCase.nextActionAt es la fuente canónica.
 */
export function CaseNextActionForm({
  caseId,
  initialDate,
}: {
  caseId: string;
  initialDate: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialDate);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [intent, setIntent] = useState<"save" | "clear" | null>(null);
  const [pending, startTransition] = useTransition();

  function updateDate(nextActionAt: string | null, nextIntent: "save" | "clear") {
    setError(null);
    setSuccess(null);
    setIntent(nextIntent);
    startTransition(async () => {
      const result = await setNextActionAt(caseId, { nextActionAt });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        setIntent(null);
        return;
      }
      playActionResult(true);
      if (nextIntent === "clear") setValue("");
      setSuccess(
        nextIntent === "clear"
          ? "Fecha eliminada."
          : "Próxima acción actualizada.",
      );
      setIntent(null);
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        updateDate(value || null, "save");
      }}
    >
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="next-action"
            className="mb-1.5 block text-xs font-medium text-text-secondary"
          >
            Fecha de la próxima acción
          </label>
          <DateInput
            id="next-action"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSuccess(null);
            }}
            pickerTitle="Elegir fecha de próxima acción"
            className="w-full sm:w-52"
          />
        </div>
        <div className="flex min-h-11 flex-wrap items-center gap-1.5">
          <Button type="submit" size="md" disabled={pending}>
            {pending && intent === "save" ? "Guardando…" : "Guardar fecha"}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="md"
              disabled={pending}
              onClick={() => updateDate(null, "clear")}
            >
              {pending && intent === "clear" ? "Eliminando…" : "Eliminar fecha"}
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
    </form>
  );
}
