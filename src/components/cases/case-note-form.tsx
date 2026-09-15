"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Textarea } from "@/src/components/ui";
import { addServiceCaseNoteAction } from "@/src/actions/notes";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * NT-001 — formulario de nota humana en la ficha del expediente.
 * La lista la renderiza el servidor; aquí solo se crea y se refresca.
 */
export function CaseNoteForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addServiceCaseNoteAction({ caseId, body });
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
        id="case-note-body"
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
