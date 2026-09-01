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

/**
 * Botón + modal para crear una ronda de disputa en un caso abierto.
 * El número de ronda lo asigna el backend (max + 1 por caso).
 */
export function CreateRoundButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [lettersCount, setLettersCount] = useState("");
  const [disputedItemsCount, setDisputedItemsCount] = useState("");
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
        ...(disputedItemsCount
          ? { disputedItemsCount: Number(disputedItemsCount) }
          : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setNotes("");
      setLettersCount("");
      setDisputedItemsCount("");
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
        description="La ronda se crea en borrador; podrás marcarla como enviada después."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cartas enviadas" htmlFor="letters-count">
              <Input
                id="letters-count"
                type="number"
                min={0}
                value={lettersCount}
                onChange={(e) => setLettersCount(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Elementos disputados" htmlFor="items-count">
              <Input
                id="items-count"
                type="number"
                min={0}
                value={disputedItemsCount}
                onChange={(e) => setDisputedItemsCount(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          <Field label="Notas" htmlFor="round-notes">
            <Textarea
              id="round-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              placeholder="Qué se disputa, a qué burós, observaciones…"
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
