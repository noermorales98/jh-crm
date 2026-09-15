"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/src/components/ui";
import { moveServiceCaseStageAction } from "@/src/actions/service-cases";
import { playActionResult } from "@/src/lib/cuelume";
import type { StageOption } from "@/src/components/cases/create-case-button";

/**
 * Fase 5 — selector de etapa del expediente genérico (por serviceCaseId).
 * Solo WorkflowStage del mismo Service.
 */
export function ServiceCaseStageSelect({
  serviceCaseId,
  currentStageId,
  stages,
  disabled,
}: {
  serviceCaseId: string;
  currentStageId: string;
  stages: StageOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentStageId);
  const [prevStageId, setPrevStageId] = useState(currentStageId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Ajuste durante render: si el servidor cambia la etapa, resincroniza.
  if (prevStageId !== currentStageId) {
    setPrevStageId(currentStageId);
    setValue(currentStageId);
  }

  const current = stages.find((s) => s.id === value);

  return (
    <div>
      <div className="flex items-center gap-2">
        {current ? (
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: current.color }}
          />
        ) : null}
        <select
          aria-label="Etapa del expediente"
          value={value}
          disabled={disabled || pending}
          onChange={(e) => {
            const next = e.target.value;
            const previous = value;
            setValue(next);
            setError(null);
            startTransition(async () => {
              const result = await moveServiceCaseStageAction(
                serviceCaseId,
                next,
              );
              if (!result.ok) {
                playActionResult(false);
                setValue(previous);
                setError(result.error);
                return;
              }
              playActionResult(true);
              router.refresh();
            });
          }}
          className="block rounded-control border border-border-subtle bg-surface-elevated px-3 py-1.5 text-sm font-medium text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/15 disabled:opacity-60"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {pending ? (
          <span className="text-xs text-text-secondary">Guardando…</span>
        ) : null}
      </div>
      {error ? (
        <div className="mt-2">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
    </div>
  );
}
