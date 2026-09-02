"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, DateInput } from "@/src/components/ui";
import { setNextReviewDate } from "@/src/actions/cases";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * Formulario inline para programar la próxima revisión del caso.
 * Dejar la fecha vacía y guardar elimina la revisión programada.
 */
export function CaseReviewForm({
  caseId,
  initialDate,
}: {
  caseId: string;
  initialDate: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setNextReviewDate(caseId, {
            nextReviewAt: value || null,
          });
          if (!result.ok) {
            playActionResult(false);
            setError(result.error);
            return;
          }
          playActionResult(true);
          router.refresh();
        });
      }}
    >
      <div>
        <label
          htmlFor="next-review"
          className="mb-1 block text-xs font-medium text-text-secondary"
        >
          Próxima revisión
        </label>
        <DateInput
          id="next-review"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-44"
        />
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Guardando…" : "Programar"}
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </form>
  );
}
