"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Textarea,
} from "@/src/components/ui";
import { createRound } from "@/src/actions/rounds";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * Botón + modal para crear una ronda de disputa en un caso abierto.
 * Los elementos disputados se seleccionan después en el detalle de la ronda.
 */
export function CreateRoundButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [lettersCount, setLettersCount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createRound({
        caseId,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(lettersCount ? { lettersCount: Number(lettersCount) } : {}),
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      setNotes("");
      setLettersCount("");
      router.push(`/crm/casos/${caseId}/rondas/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Nueva ronda
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Crear ronda de disputa"
        description="La ronda se crea en borrador. Después selecciona los elementos a disputar."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Cartas (opcional)" htmlFor="letters-count">
            <Input
              id="letters-count"
              type="number"
              min={0}
              value={lettersCount}
              onChange={(e) => setLettersCount(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Notas" htmlFor="round-notes">
            <Textarea
              id="round-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              placeholder="Observaciones de la ronda…"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear ronda"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
