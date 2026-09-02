"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { playActionResult } from "@/src/lib/cuelume";
import { defaultAssigneeId } from "@/src/lib/assignee";
import {
  Alert,
  Button,
  ConfirmDialog,
  DateInput,
  Field,
  Modal,
  Select,
} from "@/src/components/ui";
import {
  cancelRound,
  markRoundReviewed,
  markRoundSent,
} from "@/src/actions/rounds";

/**
 * Acciones de una ronda según su estado:
 * - DRAFT/PREPARING → "Marcar enviada" (modal: fecha esperada de revisión +
 *   checkbox para crear la tarea de revisión) y "Cancelar".
 * - SENT/WAITING_UPDATE/REVIEWING → "Marcar revisada" (completa) y "Cancelar".
 * Se usa en /casos/[id]/rondas y en la vista global /rondas.
 */
export function RoundActions({
  roundId,
  status,
  members,
}: {
  roundId: string;
  status: string;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [sentOpen, setSentOpen] = useState(false);
  const [expectedReviewAt, setExpectedReviewAt] = useState("");
  const [createReviewTask, setCreateReviewTask] = useState(true);
  const [assignedToId, setAssignedToId] = useState(() =>
    defaultAssigneeId(members),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSend = status === "DRAFT" || status === "PREPARING";
  const canReview =
    status === "SENT" || status === "WAITING_UPDATE" || status === "REVIEWING";
  const canCancel = canSend || canReview;

  function handleMarkSent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await markRoundSent(roundId, {
        expectedReviewAt,
        createReviewTask,
        ...(assignedToId ? { assignedToId } : {}),
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setSentOpen(false);
      setExpectedReviewAt("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canSend ? (
        <Button variant="secondary" size="sm" onClick={() => setSentOpen(true)}>
          Marcar enviada
        </Button>
      ) : null}
      {canReview ? (
        <ConfirmDialog
          title="Marcar ronda como revisada"
          message="La ronda se marcará como completada (revisión registrada hoy)."
          confirmLabel="Marcar revisada"
          trigger={
            <Button variant="secondary" size="sm">
              Marcar revisada
            </Button>
          }
          onConfirm={async () => {
            const result = await markRoundReviewed(roundId, {
              outcome: "COMPLETED",
            });
            if (!result.ok) return result.error;
            router.refresh();
          }}
        />
      ) : null}
      {canCancel ? (
        <ConfirmDialog
          title="Cancelar ronda"
          message="La ronda quedará cancelada. No se puede cancelar una ronda completada."
          confirmLabel="Cancelar ronda"
          danger
          trigger={
            <Button variant="ghost" size="sm">
              Cancelar
            </Button>
          }
          onConfirm={async () => {
            const result = await cancelRound(roundId);
            if (!result.ok) return result.error;
            router.refresh();
          }}
        />
      ) : null}

      <Modal
        open={sentOpen}
        onClose={() => setSentOpen(false)}
        title="Marcar ronda como enviada"
        description="Registra la fecha en que esperas la actualización del buró."
      >
        <form onSubmit={handleMarkSent} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Fecha esperada de revisión" htmlFor="expected-review" required>
            <DateInput
              id="expected-review"
              value={expectedReviewAt}
              onChange={(e) => setExpectedReviewAt(e.target.value)}
              required
            />
          </Field>
          <label className="flex items-start gap-2 text-sm text-text-secondary-strong">
            <input
              type="checkbox"
              checked={createReviewTask}
              onChange={(e) => setCreateReviewTask(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border-subtle text-action-primary focus:ring-focus/15"
            />
            Crear tarea de revisión para esa fecha
          </label>
          {createReviewTask ? (
            <Field label="Responsable de la tarea" htmlFor="review-assignee" hint="Si no eliges, se asigna al responsable del caso.">
              <Select
                id="review-assignee"
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
              >
                <option value="">Responsable del caso</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setSentOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Marcar enviada"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
