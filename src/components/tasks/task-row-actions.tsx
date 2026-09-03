"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, UserCog, XCircle } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Modal,
  Select,
} from "@/src/components/ui";
import { playActionResult } from "@/src/lib/cuelume";
import { cancelTask, completeTask, reassignTask } from "@/src/actions/tasks";

/**
 * Acciones inline de una tarea: completar, reasignar (modal) y cancelar.
 * Solo para tareas PENDING/IN_PROGRESS (la página decide renderizarlo).
 */
export function TaskRowActions({
  taskId,
  members,
  currentAssigneeId,
}: {
  taskId: string;
  members: { id: string; name: string }[];
  currentAssigneeId: string | null;
}) {
  const router = useRouter();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState(currentAssigneeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }>,
    onDone?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      onDone?.();
      router.refresh();
    });
  }

  const iconBtn =
    "inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => completeTask(taskId))}
          className={`${iconBtn} text-success-ink hover:bg-success-soft`}
        >
          <CheckCircle2 className="size-3.5" aria-hidden />
          Completar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setReassignOpen(true)}
          className={`${iconBtn} text-action-primary hover:bg-nav-hover`}
        >
          <UserCog className="size-3.5" aria-hidden />
          Reasignar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => cancelTask(taskId))}
          className={`${iconBtn} text-text-secondary hover:bg-nav-hover`}
        >
          <XCircle className="size-3.5" aria-hidden />
          Cancelar
        </button>
      </div>
      {error ? <span className="text-xs text-danger-ink">{error}</span> : null}

      <Modal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title="Reasignar tarea"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!assigneeId) {
              setError("Selecciona un responsable.");
              return;
            }
            run(
              () => reassignTask(taskId, { assignedToId: assigneeId }),
              () => setReassignOpen(false),
            );
          }}
          className="space-y-4"
        >
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Nuevo responsable" htmlFor="reassign-select" required>
            <Select
              id="reassign-select"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              required
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setReassignOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Reasignar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
