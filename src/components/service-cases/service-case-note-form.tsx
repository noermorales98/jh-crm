"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Textarea } from "@/src/components/ui";
import { addServiceCaseNoteByIdAction } from "@/src/actions/service-cases";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * NT-001 / Fase 5 — nota en expediente genérico (por serviceCaseId).
 */
export function ServiceCaseNoteForm({
  serviceCaseId,
}: {
  serviceCaseId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addServiceCaseNoteByIdAction({
        serviceCaseId,
        body,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setBody("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Textarea
        id="sc-note-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder="Escribe una nota sobre el expediente…"
        aria-label="Nueva nota del expediente"
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !body.trim()}>
          {pending ? "Guardando…" : "Añadir nota"}
        </Button>
      </div>
    </form>
  );
}
