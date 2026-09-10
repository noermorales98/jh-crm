"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Textarea } from "@/src/components/ui";
import { addClientNoteAction } from "@/src/actions/notes";
import { playActionResult } from "@/src/lib/cuelume";

export function ClientNoteForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addClientNoteAction({ clientId, body });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error ?? "No se pudo guardar.");
        return;
      }
      playActionResult(true);
      setBody("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Nueva nota" htmlFor="client-note-body">
        <Textarea
          id="client-note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Escribe una nota interna…"
          required
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {pending ? "Guardando…" : "Agregar nota"}
        </Button>
      </div>
    </form>
  );
}
