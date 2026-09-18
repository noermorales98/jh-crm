"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { completeTask, cancelTask } from "@/src/actions/tasks";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * Acciones inline: completar y cancelar (sin reasignar — un solo operador).
 */
export function TaskRowActions({
  taskId,
}: {
  taskId: string;
  members?: { id: string; name: string }[];
  currentAssigneeId?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }>,
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
          onClick={() => run(() => cancelTask(taskId))}
          className={`${iconBtn} text-text-secondary hover:bg-nav-hover`}
        >
          <XCircle className="size-3.5" aria-hidden />
          Cancelar
        </button>
      </div>
      {error ? <span className="text-xs text-danger-ink">{error}</span> : null}
    </div>
  );
}
