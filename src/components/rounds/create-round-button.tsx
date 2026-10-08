"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";
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
export function CreateRoundButton({
  caseId,
  menuItem = false,
  label = "Nueva ronda",
  /** Si true, no navega al detalle de ronda; solo refresh (hub cliente). */
  stayOnPage = false,
  onCreated,
}: {
  caseId: string;
  menuItem?: boolean;
  label?: string;
  stayOnPage?: boolean;
  onCreated?: (roundId: string) => void;
}) {
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
      onCreated?.(result.data.id);
      if (stayOnPage) {
        router.refresh();
        return;
      }
      // Legacy push: la ruta de casos redirige al hub con Avance abierto.
      router.push(`/crm/casos/${caseId}/rondas/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <>
      {menuItem ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-nav-hover"
          onClick={() => setOpen(true)}
        >
          <RefreshCcw
            className="size-3.5 shrink-0 text-text-secondary"
            aria-hidden
          />
          {label}
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}
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
