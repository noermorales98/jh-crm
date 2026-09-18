"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Textarea,
} from "@/src/components/ui";
import { updateCreditCase } from "@/src/actions/cases";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * Resumen y responsable del caso (updateCreditCase).
 */
export function CaseSummaryForm({
  caseId,
  initialSummary,
  currentAssigneeId,
  members,
}: {
  caseId: string;
  initialSummary: string;
  currentAssigneeId: string | null;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [assignedToId, setAssignedToId] = useState(currentAssigneeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateCreditCase(caseId, {
        summary,
        assignedToId: assignedToId || null,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">Cambios guardados.</Alert> : null}
      <Field label="Resumen del caso" htmlFor="case-summary-edit">
        <Textarea
          id="case-summary-edit"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={5}
          maxLength={5000}
          placeholder="Situación del cliente, objetivos, acuerdos…"
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
