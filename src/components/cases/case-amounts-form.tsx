"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@/src/components/ui";
import { updateCaseAmounts } from "@/src/actions/cases";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * PY-002 / Fase 4 — montos del expediente (ServiceCase.quotedAmount / agreedAmount).
 * El balance canónico del expediente es agreedAmount − pagos RECEIVED.
 */
export function CaseAmountsForm({
  caseId,
  initialQuoted,
  initialAgreed,
}: {
  caseId: string;
  initialQuoted: string;
  initialAgreed: string;
}) {
  const router = useRouter();
  const [quoted, setQuoted] = useState(initialQuoted);
  const [agreed, setAgreed] = useState(initialAgreed);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateCaseAmounts(caseId, {
        quotedAmount: quoted || null,
        agreedAmount: agreed || null,
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
      {success ? <Alert tone="success">Montos guardados.</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monto cotizado" htmlFor="case-quoted">
          <Input
            id="case-quoted"
            inputMode="decimal"
            value={quoted}
            onChange={(e) => setQuoted(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Monto acordado" htmlFor="case-agreed">
          <Input
            id="case-agreed"
            inputMode="decimal"
            value={agreed}
            onChange={(e) => setAgreed(e.target.value)}
            placeholder="0.00"
          />
        </Field>
      </div>
      <p className="text-xs text-text-secondary">
        El balance del expediente se calcula como monto acordado menos pagos
        recibidos.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar montos"}
        </Button>
      </div>
    </form>
  );
}
