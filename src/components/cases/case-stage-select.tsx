"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/src/components/ui";
import { moveCaseToStage } from "@/src/actions/cases";
import type { StageOption } from "./create-case-button";

/**
 * Selector de etapa del caso (moveCaseToStage). Muestra un punto con el
 * color de la etapa actual; al cambiar, confirma con el servidor.
 */
export function CaseStageSelect({
  caseId,
  currentStageId,
  stages,
  disabled,
}: {
  caseId: string;
  currentStageId: string;
  stages: StageOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentStageId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
          aria-label="Etapa del caso"
          value={value}
          disabled={disabled || pending}
          onChange={(e) => {
            const next = e.target.value;
            const previous = value;
            setValue(next);
            setError(null);
            startTransition(async () => {
              const result = await moveCaseToStage(caseId, next);
              if (!result.ok) {
                setValue(previous);
                setError(result.error);
                return;
              }
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
