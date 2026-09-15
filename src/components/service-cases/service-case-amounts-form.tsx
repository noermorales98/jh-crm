"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@/src/components/ui";
import { updateServiceCaseAmountsAction } from "@/src/actions/service-cases";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * PY-002 / Fase 5 — montos del expediente por serviceCaseId.
 * El balance canónico es agreedAmount − pagos RECEIVED.
 */
export function ServiceCaseAmountsForm({
  serviceCaseId,
  initialQuoted,
  initialAgreed,
}: {
  serviceCaseId: string;
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
      const result = await updateServiceCaseAmountsAction(serviceCaseId, {
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
        <Field label="Monto cotizado" htmlFor="sc-quoted">
          <Input
            id="sc-quoted"
            inputMode="decimal"
            value={quoted}
            onChange={(e) => setQuoted(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Monto acordado" htmlFor="sc-agreed">
          <Input
            id="sc-agreed"
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
