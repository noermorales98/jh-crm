"use client";

import { useState, useTransition } from "react";
import { applyAiProposalAction } from "@/src/actions/ai-proposals";
import { playActionResult } from "@/src/lib/cuelume";
import { Button } from "@/src/components/ui";

export type AiProposal = {
  kind?: string;
  title?: string;
  details?: string;
};

export function AiProposalCards({
  proposals,
  clientId,
  caseId,
  messageId,
}: {
  proposals: AiProposal[];
  clientId?: string | null;
  caseId?: string | null;
  messageId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<Record<string, "applied" | "dismissed">>({});
  const [error, setError] = useState<string | null>(null);

  if (!proposals.length) return null;

  function keyOf(index: number) {
    return `${messageId}:${index}`;
  }

  function apply(index: number, proposal: AiProposal) {
    setError(null);
    if (!clientId) {
      setError("Falta el cliente: vuelve a llamar la herramienta con caseId o indícalo.");
      playActionResult(false);
      return;
    }
    const kind =
      proposal.kind === "task" ||
      proposal.kind === "activity" ||
      proposal.kind === "status_note"
        ? proposal.kind
        : "activity";
    const title = (proposal.title ?? "").trim() || "Acción de IA";
    startTransition(async () => {
      const result = await applyAiProposalAction({
        kind,
        title,
        details: proposal.details ?? null,
        clientId,
        caseId: caseId ?? null,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setDone((prev) => ({ ...prev, [keyOf(index)]: "applied" }));
    });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border-subtle/60 pt-3">
      <p className="text-xs font-medium text-text-secondary">
        Propuestas de IA — confirma antes de aplicar
      </p>
      {error ? <p className="text-xs text-danger-ink">{error}</p> : null}
      {proposals.map((proposal, index) => {
        const key = keyOf(index);
        const state = done[key];
        const kindLabel =
          proposal.kind === "task"
            ? "Tarea"
            : proposal.kind === "status_note"
              ? "Nota de estado"
              : "Actividad";
        return (
          <div
            key={key}
            className="rounded-control bg-surface-elevated px-3 py-2 ring-1 ring-border-subtle/50"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              {kindLabel}
            </p>
            <p className="mt-0.5 text-sm font-medium text-ink">
              {proposal.title?.trim() || "Sin título"}
            </p>
            {proposal.details?.trim() ? (
              <p className="mt-1 text-xs text-text-secondary">{proposal.details}</p>
            ) : null}
            {state === "applied" ? (
              <p className="mt-2 text-xs text-success-ink">Aplicada</p>
            ) : state === "dismissed" ? (
              <p className="mt-2 text-xs text-text-secondary">Descartada</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => apply(index, proposal)}
                >
                  Confirmar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    setDone((prev) => ({ ...prev, [key]: "dismissed" }))
                  }
                >
                  Descartar
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Extrae proposals + contexto de un part de tool del chat. */
export function proposalsFromToolPart(part: {
  type: string;
  state?: string;
  output?: unknown;
  toolName?: string;
}): { proposals: AiProposal[]; clientId?: string | null; caseId?: string | null } | null {
  const name =
    part.toolName ??
    (part.type.startsWith("tool-") ? part.type.slice("tool-".length) : "");
  if (name !== "extractNoteActions") return null;
  if (part.state && part.state !== "output-available") return null;
  const output = part.output;
  if (!output || typeof output !== "object") return null;
  const record = output as {
    proposals?: unknown;
    clientId?: unknown;
    caseId?: unknown;
  };
  if (!Array.isArray(record.proposals) || record.proposals.length === 0) {
    return null;
  }
  return {
    proposals: record.proposals as AiProposal[],
    clientId: typeof record.clientId === "string" ? record.clientId : null,
    caseId: typeof record.caseId === "string" ? record.caseId : null,
  };
}
